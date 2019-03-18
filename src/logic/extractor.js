import _ from 'lodash';
import axios from "axios";
import axiosRetry from 'axios-retry';
import * as traverse from "traverse";
import * as FileSaver from "file-saver";
import moment from "moment";

import {store} from "../store";
import * as actionTypes from "../actions/actionTypes";
import * as settingsAction from "../actions/settingsAction";
import * as configuration from "./configuration";

axiosRetry(axios, { retries: 10 });

const timeout = ms => new Promise(res => setTimeout(res, ms));

export let Extractor = (function () {
    let instance;
    return {
        getInstance: function () {
            if (instance == null) {
                instance = new ExtractorClass();
                instance.constructor = null;
            }
            return instance;
        }
    };
})();

let ExtractorClass = function () {
    this.fetchedItems = new Set();
};

ExtractorClass.prototype.init = function (builder) {
    this.d2 = builder.d2;
    this.metadataMap = new Map();
    this.debug = builder.debug || false;
    this.concurrentExtractions = 0;
};

ExtractorClass.prototype.initialFetchAndRetrieve = async function (elements) {
    while (this.concurrentExtractions > 5) await timeout(500);

    this.concurrentExtractions += 1;
    let json = await this.parseElements(elements);
    await this.fetchAndRetrieve(json);
    this.concurrentExtractions -= 1;

    store.dispatch({
        type: actionTypes.GRID_ADD_DEPENDENCIES,
        dependencies: Array.from(this.fetchedItems)
    });
};

ExtractorClass.prototype.fetchAndRetrieve = async function (json) {
    for (const metadataType in json) {
        if (Array.isArray(json[metadataType])) {
            let elements = json[metadataType].filter(e => e.id !== undefined && e.code !== 'default');
            for (const element of elements) {
                // Insert on the metadata map
                this.metadataMap.set(element.id, {metadataType, ...element} );

                if (this.debug) console.log('fetchAndRetrieve: Parsing ' + element.id);

                // Traverse references and call recursion
                let references = await this.recursiveParse(element, this.d2.models[metadataType].name);
                let newJson = await this.parseElements(references);
                await this.fetchAndRetrieve(newJson);
            }
        }
    }
};

ExtractorClass.prototype.recursiveParse = async function (element, type) {
    let context = this;
    let references = [];
    traverse(element).forEach(function (item) {
        if (this.isLeaf && this.key === 'id' && item !== '') {
            let parent = this.parent;
            while (parent.level > 1 && context.d2.models[parent.key] === undefined) parent = parent.parent;
            if (parent.key !== undefined) {
                let key = parent.key === 'children' ? 'organisationUnit' : parent.key;
                let model = context.d2.models[key];
                if (model !== undefined && context.shouldDeepCopy(type, model.name))
                    references.push(item);
            }
        }
    });
    return references;
};

ExtractorClass.prototype.parseElements = async function (elementsArray) {
    let elements = _.uniq(elementsArray.filter(x => !this.fetchedItems.has(x)));
    _.forEach(elements, (element) => this.fetchedItems.add(element));
    let promises = [];
    for (let i = 0; i < elements.length; i += 100) {
        let requestUrl = this.d2.Api.getApi().baseUrl +
            '/metadata.json?fields=:all&filter=id:in:[' + elements.slice(i, i + 100).toString() + ']';
        if (this.debug) console.log('parseElements: ' + requestUrl);
        promises.push(axios.get(requestUrl));
    }
    let result = await Promise.all(promises);
    return _.merge({}, ...result.map(result => result.data));
};

ExtractorClass.prototype.handleCreatePackage = async function (elements, dependencies) {
    store.dispatch({type: actionTypes.LOADING, loading: true});

    let result = await this.createPackage(elements, dependencies);

    let fileName = 'extraction-' + moment().format('YYMMDDHHmm') + '.json';
    FileSaver.saveAs(new Blob([JSON.stringify(result, null, 4)], {
        type: 'application/json',
        name: fileName
    }), fileName);
    store.dispatch({type: actionTypes.LOADING, loading: false});
};

ExtractorClass.prototype.createPackage = async function (elements, dependencies) {
    if (this.debug) console.log('Generating final package');
    let elementSet = new Set([...elements, ...dependencies]);
    let resultObject = {date: new Date().toISOString()};

    for (const id of elementSet) {
        if (this.metadataMap.has(id)) {
            let element = this.metadataMap.get(id);
            let elementType = this.d2.models[element.metadataType].plural;
            if (resultObject[elementType] === undefined) resultObject[elementType] = [];
            resultObject[elementType].push(cleanJson(element));
        } else if(this.debug) {
            console.error('[ERROR]: Consistency failure, element ' + id + ' not found!')
        }
    }

    return resultObject;
};

ExtractorClass.prototype.shouldDeepCopy = function (type, key) {
    for (const ruleSet of configuration.dependencyRules) {
        if (ruleSet.metadataType === "*" || ruleSet.metadataType === type) {
            for (const rule of ruleSet.rules) {
                if (key === rule.metadataType) return rule.condition(type);
            }
        }
    }

    _.forOwn(this.blacklist, (metadataType, items) => {
        if (metadataType === "*" || metadataType === type) {
            if (items.includes(key)) return false;
        }
    });
    return true;
};

ExtractorClass.prototype.attachToExecutor = async function () {
    store.dispatch({type: actionTypes.LOADING, loading: true});
    while (this.concurrentExtractions > 0) await timeout(500);
    store.dispatch({type: actionTypes.LOADING, loading: false});
};

ExtractorClass.prototype.updateBlacklist = function (blacklist) {
    this.blacklist = blacklist;
};

ExtractorClass.prototype.getElementById = async function (id) {
    return this.metadataMap.get(id);
};

function cleanJson(json) {
    let result = json;
    if (store.getState().settings[actionTypes.SETTINGS_USER_CLEAN_UP] === settingsAction.USER_CLEAN_UP_REMOVE_OPTION) {
        traverse(result).forEach(function (item) {
            if (this.key === 'user') this.update({});
            if (this.key === 'users') this.update([]);
            if (this.key === 'userGroupAccesses') this.update([]);
            if (this.key === 'userAccesses') this.update([]);
            if (this.key === 'lastUpdatedBy') this.update({});
        });
    }
    if (store.getState().settings[actionTypes.SETTINGS_ORG_UNIT_CHILDREN] === settingsAction.ORG_UNIT_CHILDREN_REMOVE_OPTION) {
        traverse(result).forEach(function (item) {
            if (this.key === 'children') this.update([]);
        });
    }
    return result;
}