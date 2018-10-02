import _ from 'lodash';
import * as traverse from 'traverse';
import * as FileSaver from 'file-saver';

import {createAjaxQueue} from './ajaxMultiQueue';
import * as configuration from "./configuration";

import {store} from '../store';
import * as actionTypes from '../actions/actionTypes';
import * as settingsAction from "../actions/settingsAction";

const DEBUG = process.env.REACT_APP_DEBUG;
let ajaxQueue = createAjaxQueue(25);
let totalRequests = 0, completedRequests = 0;

/**
 * Fetch and retrieve start point, with a base id to start the query
 * @param builder: Object with d2 and database
 * @param elements: Elements to fetch
 */
export function initialFetchAndRetrieve(builder, elements) {
    return new Promise(function (resolve, reject) {
        let fetchedItems = new Set();
        let petitions = new Set();
        if (elements.length === 0) resolve();
        else parseElements({
            d2: builder.d2,
            fetchedItems,
            petitions,
            elements
        }).then((json) => {
            fetchAndRetrieve({
                d2: builder.d2,
                database: builder.database,
                fetchedItems,
                petitions,
                json
            });
        });

        let _flagCheck = setInterval(function () {
            if (completedRequests === totalRequests) {
                clearInterval(_flagCheck);
                store.dispatch({
                    type: actionTypes.GRID_ADD_DEPENDENCIES,
                    dependencies: Array.from(fetchedItems)
                });
                resolve(); // the function to run once all flags are true
            }
        }, 100); // interval set at 100 milliseconds
    });
}

/**
 * If item does not exists queries d2 to get and store the item
 * @param builder: Object with d2, database, json
 */
function fetchAndRetrieve(builder) {
    _.forEach(builder.json, function (arrayOfElements, type) {
        _.forEach(arrayOfElements, function (element) {
            if (element.id !== undefined) {
                if (DEBUG) console.log('fetchAndRetrieve: Parsing ' + element.id);
                // Insert on the database
                insertIfNotExists(builder.database, element, type);
                // Traverse references and call recursion
                recursiveParse({
                    d2: builder.d2,
                    element: element,
                    type: builder.d2.models[type].name
                }).then((references => {
                    parseElements({
                        d2: builder.d2,
                        fetchedItems: builder.fetchedItems,
                        petitions: builder.petitions,
                        elements: references
                    }).then((json) => {
                        fetchAndRetrieve({
                            d2: builder.d2,
                            database: builder.database,
                            fetchedItems: builder.fetchedItems,
                            petitions: builder.petitions,
                            json: json
                        });
                    });
                }));
            }
        });
    });
}

/**
 * Traverse element and call recursion fetchAndRetrieve
 * @param builder: Object with d2 and element to traverse
 */
function recursiveParse(builder) {
    return new Promise(function (resolve, reject) {
        let references = [];
        traverse(builder.element).forEach(function (item) {
            let context = this;
            if (context.isLeaf && context.key === 'id' && item !== '') {
                if (context.parent !== undefined && context.parent.key !== undefined) {
                    let key = context.parent.key === 'children' ? 'organisationUnit' : context.parent.key;
                    let model = builder.d2.models[key];
                    if (model !== undefined && shouldDeepCopy(builder.type, model.name))
                        references.push(item);
                }
            }
        });
        resolve(references);
    });
}

function parseElements(builder) {
    return new Promise(function (resolve, reject) {
        _.forEach(builder.elements, (element) => builder.fetchedItems.add(element));
        if (builder.elements.length > 0) {
            let requestUrl = builder.d2.Api.getApi().baseUrl + '/metadata.json?fields=:all&filter=id:in:[' + builder.elements.toString() + ']';
            if (!builder.petitions.has(requestUrl)) {
                if (DEBUG) console.log('parseElements: ' + requestUrl);
                totalRequests += 1;
                ajaxQueue.queue({
                    dataType: "json",
                    url: requestUrl,
                    success: function (json) {
                        completedRequests += 1;
                        resolve(json);
                    },
                    fail: reject
                });
            }
            builder.petitions.add(requestUrl);
        }
    });
}

export function handleCreatePackage(builder, elements) {
    store.dispatch({type: actionTypes.LOADING, loading: true});
    initialFetchAndRetrieve(builder, elements).then(() => {
        createPackage(builder, elements).then((result) => {
            FileSaver.saveAs(new Blob([JSON.stringify(result, null, 4)], {
                type: 'application/json',
                name: 'extraction.json'
            }), 'extraction.json');
            store.dispatch({type: actionTypes.LOADING, loading: false});
        });
    });
}

/**
 * Creates an export package
 * @param builder: Object with d2 and database
 * @param elements: Elements to export
 * @returns {Promise<any>}: Promise that either resolves or rejects
 */
function createPackage(builder, elements) {
    return new Promise(function (resolve, reject) {
        let next = function () {
            if (DEBUG) console.log('Generating final package');
            let elementSet = new Set(elements);
            let resultObject = {date: new Date().toISOString()};
            builder.database.allDocs({
                include_docs: true,
            }).then(function (result) {
                for (let i = 0; i < result.rows.length; ++i) {
                    let element = result.rows[i].doc;
                    let elementType = builder.d2.models[element.type].plural;
                    if (elementSet.has(element._id)) {
                        if (resultObject[elementType] === undefined) resultObject[elementType] = [];
                        resultObject[elementType].push(cleanJson(element.json));
                    } else {
                        // TODO: This should never happen but we should add a fail-safe
                        if (DEBUG) console.error('[ERROR]: Consistency failure, element not found in database!')
                    }
                }
                resolve(resultObject);
            }).catch(function (err) {
                console.log(err);
                reject(err);
            });
        };

        let _flagCheck = setInterval(function () {
            if (completedRequests === totalRequests) {
                clearInterval(_flagCheck);
                next(); // the function to run once all flags are true
            }
        }, 100); // interval set at 100 milliseconds
    });
}

function insertIfNotExists(database, element, type) {
    return new Promise(function (resolve, reject) {
        database.put({
            _id: element.id,
            type: type,
            json: element,
        }).then(() => resolve()).catch(function (err) {
            if (err.name !== 'conflict') reject(err);
        });
    });
}

function shouldDeepCopy(type, key) {
    let defaultExitCondition = () => true;
    for (const ruleSet of configuration.dependencyRules) {
        if (ruleSet.metadataType === "*" || ruleSet.metadataType === type) {
            for (const rule of ruleSet.rules) {
                if (key === rule.metadataType) {
                    return rule.condition(type);
                }
            }
            if (ruleSet.metadataType !== "*" && ruleSet.defaultCondition !== undefined)
                defaultExitCondition = ruleSet.defaultCondition;
        }
    }
    return defaultExitCondition();
}

function cleanJson(json) {
    let result = json;
    if (store.getState().settings[actionTypes.SETTINGS_USER_CLEAN_UP] === settingsAction.USER_CLEAN_UP_REMOVE_OPTION) {
        traverse(result).forEach(function (item) {
            if (this.key === 'user') this.update({});
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