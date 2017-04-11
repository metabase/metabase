import React, { Component } from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import cx from "classnames";

import AddClauseButton from "./AddClauseButton.jsx";
import Expressions from "./expressions/Expressions.jsx";
import ExpressionWidget from './expressions/ExpressionWidget.jsx';
import LimitWidget from "./LimitWidget.jsx";
import SortWidget from "./SortWidget.jsx";
import Popover from "metabase/components/Popover.jsx";

import MetabaseAnalytics from "metabase/lib/analytics";
import Query from "metabase/lib/query";


export default class ExtendedOptions extends Component {
    state = {
        isOpen: false,
        editExpression: null
    };

    static propTypes = {
        features: PropTypes.object.isRequired,
        datasetQuery: PropTypes.object.isRequired,
        tableMetadata: PropTypes.object,
        setDatasetQuery: PropTypes.func.isRequired
    };

    static defaultProps = {
        expressions: {}
    };


    setExpression(name, expression, previousName) {
        const { datasetQuery: { query } } = this.props;

        if (!_.isEmpty(previousName)) {
            // remove old expression using original name.  this accounts for case where expression is renamed.
            Query.removeExpression(query, previousName);
        }

        // now add the new expression to the query
        Query.setExpression(query, name, expression);
        this.props.setDatasetQuery(this.props.datasetQuery);
        this.setState({editExpression: null});

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Set Expression', !_.isEmpty(previousName));
    }

    removeExpression(name) {
        let scrubbedQuery = Query.removeExpression(this.props.datasetQuery.query, name);
        this.props.datasetQuery.query = scrubbedQuery;
        this.props.setDatasetQuery(this.props.datasetQuery);
        this.setState({editExpression: null});

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Remove Expression');
    }

    renderSort() {
        const { datasetQuery: { query }, tableMetadata } = this.props;

        if (!this.props.features.limit) {
            return;
        }

        let sortList, addSortButton;

        if (tableMetadata) {
            const sorts = Query.getOrderBys(query);
            const expressions = Query.getExpressions(query);

            const usedFields = {};
            const usedExpressions = {};
            for (const sort of sorts) {
                if (Query.isExpressionField(sort[0])) {
                    usedExpressions[sort[0][1]] = true;
                } else {
                    usedFields[Query.getFieldTargetId(sort[0])] = true;
                }
            }

            sortList = sorts.map((sort, index) =>
                <SortWidget
                    key={index}
                    tableMetadata={tableMetadata}
                    sort={sort}
                    fieldOptions={
                        Query.getFieldOptions(
                            tableMetadata.fields,
                            true,
                            Query.getSortableFields.bind(null, query),
                            _.omit(usedFields, sort[0])
                        )
                    }
                    customFieldOptions={expressions}
                    removeOrderBy={() => this.props.removeQueryOrderBy(index)}
                    updateOrderBy={(orderBy) => this.props.updateQueryOrderBy(index, orderBy)}
                />
            );


            const remainingFieldOptions = Query.getFieldOptions(
                tableMetadata.fields,
                true,
                Query.getSortableFields.bind(null, query),
                usedFields
            );
            const remainingExpressions = Object.keys(_.omit(expressions, usedExpressions));
            if ((remainingFieldOptions.count > 0 || remainingExpressions.length > 1) &&
                (sorts.length === 0 || sorts[sorts.length - 1][0] != null)) {
                addSortButton = (<AddClauseButton text="Pick a field to sort by" onClick={() => this.props.addQueryOrderBy([null, "ascending"])} />);
            }
        }

        if ((sortList && sortList.length > 0) || addSortButton) {
            return (
                <div className="pb3">
                    <div className="pb1 h6 text-uppercase text-grey-3 text-bold">Sort</div>
                    {sortList}
                    {addSortButton}
                </div>
            );
        }
    }

    renderExpressionWidget() {
        // if we aren't editing any expression then there is nothing to do
        if (!this.state.editExpression || !this.props.tableMetadata) return null;

        const query = this.props.datasetQuery.query,
              expressions = Query.getExpressions(query),
              expression = expressions && expressions[this.state.editExpression],
              name = _.isString(this.state.editExpression) ? this.state.editExpression : "";

        return (
            <Popover onClose={() => this.setState({editExpression: null})}>
                <ExpressionWidget
                    name={name}
                    expression={expression}
                    tableMetadata={this.props.tableMetadata}
                    onSetExpression={(newName, newExpression) => this.setExpression(newName, newExpression, name)}
                    onRemoveExpression={(name) => this.removeExpression(name)}
                    onCancel={() => this.setState({editExpression: null})}
                />
            </Popover>
        );
    }

    renderPopover() {
        if (!this.state.isOpen) return null;

        const { features, datasetQuery, tableMetadata } = this.props;

        return (
            <Popover onClose={() => this.setState({isOpen: false})}>
                <div className="p3">
                    {this.renderSort()}

                    {_.contains(tableMetadata.db.features, "expressions") ?
                        <Expressions
                            expressions={datasetQuery.query.expressions}
                            tableMetadata={tableMetadata}
                            onAddExpression={() => this.setState({isOpen: false, editExpression: true})}
                            onEditExpression={(name) => {
                                this.setState({isOpen: false, editExpression: name});
                                MetabaseAnalytics.trackEvent("QueryBuilder", "Show Edit Custom Field");
                            }}
                        />
                    : null}

                    { features.limit &&
                        <div>
                            <div className="mb1 h6 text-uppercase text-grey-3 text-bold">Row limit</div>
                            <LimitWidget limit={datasetQuery.query.limit} onChange={(limit) => {
                                this.props.updateQueryLimit(limit);
                                this.setState({ isOpen: false })
                            }} />
                        </div>
                    }
                </div>
            </Popover>
        );
    }

    render() {
        const { features } = this.props;
        if (!features.sort && !features.limit) return null;

        const onClick = this.props.tableMetadata ? () => this.setState({isOpen: true}) : null;

        return (
            <div className="GuiBuilder-section GuiBuilder-sort-limit flex align-center">
                <span className={cx("EllipsisButton no-decoration text-grey-1 px1", {"cursor-pointer": onClick})} onClick={onClick}>…</span>
                {this.renderPopover()}
                {this.renderExpressionWidget()}
            </div>
        );
    }
}
