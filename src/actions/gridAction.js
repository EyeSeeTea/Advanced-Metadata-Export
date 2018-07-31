import {GRID_STATE_CHANGE} from "./actionTypes";

export const gridInitialState = {
    rows: [],
    columns: [{
        name: 'id',
        title: 'ID'
    }, {
        name: 'name',
        title: 'Name'
    }, {
        name: 'type',
        title: 'Type'
    }],
    tableColumnExtensions: [
        { columnName: 'id', align: 'center' } // TODO: This fixes detailCell bug
    ],
    sorting: [{columnName: 'type', direction: 'asc'}],
    grouping: [{columnName: 'type'}],
    expandedGroups: [],
    selection: [],
    selectionAsIndeterminate: [],
    expandedRowIds: [],
    filters: [],
    columnOrder: [],
    columnWidths: [],
    totalCount: 0,
    pageSize: 8,
    pageSizes: [5, 8, 16],
    currentPage: 0,
    searchValue1: '',
    searchValue2: '',
    loading: false
};

export const createGridAction = (partialStateName, partialStateValue) => ({
    type: GRID_STATE_CHANGE,
    partialStateName,
    partialStateValue
});