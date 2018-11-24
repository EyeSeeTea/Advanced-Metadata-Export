import React from 'react';
import ReactDOM from 'react-dom';
import _ from 'lodash';
import {Provider} from "react-redux";
import PouchDB from 'pouchdb';

import * as D2Library from "d2/lib/d2";
import LoadingMask from 'd2-ui/lib/loading-mask/LoadingMask.component';
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider';

import * as actionTypes from "./actions/actionTypes";
import App from './components/App.js';
import theme from './components/Theme';
import {store} from "./store";
import './index.css';

const DEBUG = process.env.REACT_APP_DEBUG;

D2Library.getManifest('manifest.webapp').then((manifest) => {
    let config = {};

    // Set baseUrl
    config.baseUrl = manifest.activities !== undefined ? manifest.activities.dhis.href + '/api'
        : process.env.REACT_APP_DHIS2_BASE_URL !== undefined ? process.env.REACT_APP_DHIS2_BASE_URL + '/api'
            : config.baseUrl = window.location.href.includes('/api') ? window.location.href.split('/api')[0] + '/api'
                : undefined;

    // Set credentials
    if (process.env.REACT_APP_DEBUG === 'true') {
        console.log('Starting React App in DEBUG mode with user: ' + process.env.REACT_APP_DHIS2_USERNAME);
        config.headers = {
            Authorization: "Basic " + btoa(process.env.REACT_APP_DHIS2_USERNAME + ':' + process.env.REACT_APP_DHIS2_PASSWORD)
        }
    }

    // Init library
    D2Library.init(config).then(d2 => {
        if (DEBUG) console.log({url: config.baseUrl, d2: d2});
        store.dispatch({type: 'SET_D2', d2});
        parseMetadataTypes(d2);
        let database = new PouchDB('exports');
        database.destroy().then(function () {
            store.dispatch({type: 'SET_DATABASE', database: new PouchDB('exports')});
            ReactDOM.render(
                <Provider store={store}>
                    <App/>
                </Provider>, document.getElementById('root')
            );
        });
    });
}).catch((error) => {
    console.error('D2 initialization error:', error);
    ReactDOM.render((<div>Failed to connect with D2</div>), document.getElementById('root'));
});

ReactDOM.render(<MuiThemeProvider muiTheme={theme}><LoadingMask
    large={true}/></MuiThemeProvider>, document.getElementById('root'));

function parseMetadataTypes(d2) {
    let metadataTypes = _.uniq(Object.keys(d2.models).filter(model => {
        return d2.models[model].isMetaData;
    }).map(model => {
        return d2.models[model].name
    }));
    let parsedElements = metadataTypes.length;
    let insertMetadata = (model, result) => {
        let metadata = result.toArray().map(e => {
            return {
                id: e.id,
                name: e.displayName,
                type: model
            };
        });
        store.dispatch({type: actionTypes.GRID_ADD_METADATA, metadata});
        if (result.pager.hasNextPage()) result.pager.getNextPage().then(result => insertMetadata(model, result));
    };
    metadataTypes.forEach((model) => {
        d2.models[model].list({paging: false, fields: ['id', 'displayName']}).then(result => {
            insertMetadata(model, result);
            if (--parsedElements === 1) store.dispatch({type: actionTypes.LOADING, loading: false});
        }).catch(() => {
            if (--parsedElements === 1) store.dispatch({type: actionTypes.LOADING, loading: false});
        });
    });
}