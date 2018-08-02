import * as React from 'react';
import _ from 'lodash';
import {connect} from "react-redux";
import Paper from '@material-ui/core/Paper';
import Button from '@material-ui/core/Button/Button';
import {
    GroupingState,
    IntegratedFiltering,
    IntegratedGrouping,
    IntegratedSelection,
    IntegratedSorting,
    SearchState,
    SelectionState,
    SortingState
} from '@devexpress/dx-react-grid';
import {
    Grid,
    SearchPanel,
    TableGroupRow,
    TableHeaderRow,
    TableSelection,
    Toolbar,
    VirtualTable
} from '@devexpress/dx-react-grid-material-ui';
import {Template, TemplatePlaceholder} from '@devexpress/dx-react-core';

import * as extractor from '../logic/extractor';
import {createGridAction} from '../actions/gridAction';
import {TableSelectCell} from './TableSelectCell';
import {TableDetailCell} from './TableDetailCell';
import * as actionTypes from '../actions/actionTypes';
import Spacer from './Spacer';

class MetadataGrid extends React.PureComponent {
    constructor(props) {
        super(props);

        this.selectCell = this.selectCell.bind(this);
        this.detailCell = this.detailCell.bind(this);
    }

    getRowId = row => row.id;

    selectCell({ row, selected, ...restProps }) {
        const indeterminate = this.props.grid.selectionAsIndeterminate.findIndex(index => this.getRowId(row) === index) !== -1;
        const onDelete = (id) => this.props.grid.selectionAsIndeterminate.clear();

        const onViewDetail = () => {
            this.props.database.get(this.getRowId(row)).then((doc) => {
                this.props.showJsonDialog(doc.json);
            }).catch(() => {
                this.props.showSnackbar('Item not fetched yet');
            });
        };

        return (
            <TableSelectCell
                indeterminate={!selected && indeterminate}
                selected={selected}
                onDelete={onDelete}
                onViewDetail={onViewDetail}
                {...restProps}
            />
        );
    }

    detailCell({ row, selected, ...restProps }) {
        const onDelete = () => {
            this.props.removeFromSelection(this.getRowId(row));
        };

        const onViewDetail = () => {
            this.props.database.get(this.getRowId(row)).then((doc) => {
                this.props.showJsonDialog(doc.json);
            });
        };

        return (
            <TableDetailCell
                onDelete={onDelete}
                onViewDetail={onViewDetail}
                {...restProps}
            />
        );
    }

    render() {
        const {
            rows, columns, selection, searchValue1, searchValue2, sorting, grouping, selectionAsIndeterminate, tableColumnExtensions
        } = this.props.grid;

        const {
            onSelectionChange, onSearchValueChange1, onSearchValueChange2, onSelectionClear, onSortingChange, onGroupingChange
        } = this.props;

        const openOptions = () => this.props.showOptionsDialog();

        return (
            <div className="main-container" style={{margin: "1em", marginTop: "3em"}}>
                <Paper style={{margin: "1em"}}>
                    <Grid
                        rows={rows}
                        columns={columns}
                        getRowId={this.getRowId}
                    >
                        <SortingState
                            sorting={sorting}
                            onSortingChange={onSortingChange}
                        />
                        <GroupingState
                            grouping={grouping}
                            onGroupingChange={onGroupingChange}
                        />
                        <SelectionState
                            selection={selection}
                            onSelectionChange={onSelectionChange}
                        />
                        <SearchState
                            value={searchValue1}
                            onValueChange={onSearchValueChange1}
                        />

                        <IntegratedSorting/>
                        <IntegratedGrouping/>
                        <IntegratedSelection/>
                        <IntegratedFiltering/>

                        <VirtualTable/>

                        <TableHeaderRow/>
                        <TableGroupRow/>
                        <TableSelection
                            selectByRowClick cellComponent={this.selectCell}
                        />

                        <Toolbar/>
                        <Template
                            name="toolbarContent"
                        >
                            <TemplatePlaceholder/>
                            <Button onClick={openOptions}>
                                Options
                            </Button>
                            <Spacer grow='1'/>
                        </Template>
                        <SearchPanel/>
                    </Grid>
                </Paper>
                <div className="export-container">
                    <Paper style={{margin: "1em"}}>
                        <Grid
                            rows={_.uniq(_.concat(selection, ...selectionAsIndeterminate).map((id) => rows.find((e => e.id === id))))}
                            columns={columns}
                            getRowId={this.getRowId}
                        >
                            <SortingState
                                sorting={sorting}
                                onSortingChange={onSortingChange}
                            />
                            <SelectionState
                                selection={selection}
                                onSelectionChange={onSelectionChange}
                            />
                            <SearchState
                                value={searchValue2}
                                onValueChange={onSearchValueChange2}
                            />

                            <IntegratedSorting/>
                            <IntegratedSelection/>
                            <IntegratedFiltering/>

                            <VirtualTable
                                columnExtensions={tableColumnExtensions}
                            />

                            <TableHeaderRow/>
                            <TableSelection
                                cellComponent={this.detailCell}
                            />

                            <Toolbar/>
                            <Template
                                name="toolbarContent"
                            >
                                <TemplatePlaceholder/>
                                <Button onClick={onSelectionClear}>
                                    Clear
                                </Button>
                                <Spacer grow='1'/>
                            </Template>
                            <SearchPanel/>
                        </Grid>
                    </Paper>
                </div>
            </div>
        );
    }
}

const mapStateToProps = state => ({
    grid: state.grid,
    d2: state.d2,
    database: state.database
});

const mapDispatchToProps = dispatch => ({
    onSelectionChange: selection => dispatch(createGridAction('selection', selection)),
    onSearchValueChange1: searchValue1 => dispatch(createGridAction('searchValue1', searchValue1)),
    onSearchValueChange2: searchValue2 => dispatch(createGridAction('searchValue2', searchValue2)),
    onSortingChange: sorting => dispatch(createGridAction('sorting', sorting)),
    onGroupingChange: grouping => dispatch(createGridAction('grouping', grouping)),
    onSelectionClear: () => {
        dispatch(createGridAction('selection', []));
        dispatch(createGridAction('selectionAsIndeterminate', []));
        extractor.clearDependencies();
    },
    removeFromSelection: id => dispatch({type: actionTypes.GRID_REMOVE_FROM_SELECTION, id: id}),
    showJsonDialog: (message) => {
        dispatch({type: actionTypes.DIALOG_JSON_UPDATE, message});
        dispatch({type: actionTypes.DIALOG_JSON_SHOW, show: true});
    },
    showOptionsDialog: () => {
        dispatch({type: actionTypes.DIALOG_OPTIONS_SHOW, show: true});
    },
    showSnackbar: (message) => {
        dispatch({type: actionTypes.SNACKBAR_UPDATE, message});
        dispatch({type: actionTypes.SNACKBAR_SHOW, show: true});
    }
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(MetadataGrid);