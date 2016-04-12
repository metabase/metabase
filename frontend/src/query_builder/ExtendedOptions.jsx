import React, { Component, PropTypes } from "react";
import _ from "underscore";

import AddClauseButton from "./AddClauseButton.jsx";
import Expressions from './Expressions.jsx';
import ExpressionWidget from './ExpressionWidget.jsx';
import LimitWidget from "./LimitWidget.jsx";
import SortWidget from './SortWidget.jsx';
import Popover from "metabase/components/Popover.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";

import MetabaseAnalytics from 'metabase/lib/analytics';
import Query from "metabase/lib/query";


export default class ExtendedOptions extends Component {

    constructor(props, context) {
        super(props, context);

        this.state = {
            editExpression: null
        };

        _.bindAll(
            this,
            "addSort", "updateSort", "removeSort",
            "updateLimit"
        );
    }

    static propTypes = {
        features: PropTypes.object.isRequired,
        query: PropTypes.object.isRequired,
        tableMetadata: PropTypes.object,
        setQuery: PropTypes.func.isRequired,
        onEditExpression: PropTypes.func.isRequired
    };

    static defaultProps = {
        expressions: {}
    };


    updateLimit(limit) {
        if (limit) {
            Query.updateLimit(this.props.query.query, limit);
            MetabaseAnalytics.trackEvent('QueryBuilder', 'Set Limit');
        } else {
            Query.removeLimit(this.props.query.query);
            MetabaseAnalytics.trackEvent('QueryBuilder', 'Remove Limit');
        }
        this.props.setQuery(this.props.query);
    }

    addSort() {
        Query.addSort(this.props.query.query);
        this.props.setQuery(this.props.query);

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Set Sort', 'manual');
    }

    updateSort(index, sort) {
        Query.updateSort(this.props.query.query, index, sort);
        this.props.setQuery(this.props.query);

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Set Sort', 'manual');
    }

    removeSort(index) {
        Query.removeSort(this.props.query.query, index);
        this.props.setQuery(this.props.query);

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Remove Sort');
    }

    renderSort() {
        if (!this.props.features.limit) {
            return;
        }

        var sortFieldOptions;

        if (this.props.tableMetadata) {
            sortFieldOptions = Query.getFieldOptions(
                this.props.tableMetadata.fields,
                true,
                Query.getSortableFields.bind(null, this.props.query.query)
            );
        }

        var sortList = [];
        if (this.props.query.query.order_by && this.props.tableMetadata) {
            sortList = this.props.query.query.order_by.map((order_by, index) => {
                return (
                    <SortWidget
                        key={index}
                        tableMetadata={this.props.tableMetadata}
                        sort={order_by}
                        fieldOptions={sortFieldOptions}
                        customFieldOptions={Query.getExpressions(this.props.query.query)}
                        removeSort={this.removeSort.bind(null, index)}
                        updateSort={this.updateSort.bind(null, index)}
                    />
                );
            });
        }

        var content;
        if (sortList.length > 0) {
            content = sortList;
        } else if (sortFieldOptions && sortFieldOptions.count > 0) {
            content = (<AddClauseButton text="Pick a field to sort by" onClick={this.addSort} />);
        }

        if (content) {
            return (
                <div className="py2 border-bottom">
                    <div className="Query-label mb1">Sort</div>
                    {content}
                </div>
            );
        }
    }

    renderExpressionWidget() {
        // if we aren't editing any expression then there is nothing to do
        if (!this.state.editExpression || !this.props.tableMetadata) return null;

        const query = this.props.query.query,
              expressions = Query.getExpressions(query);
        let expression = expressions && expressions[this.state.editExpression],
            name = _.isString(this.state.editExpression) ?  this.state.editExpression : "";

        return (
            <Popover
                ref="expressionPopover"
                className="FilterPopover"
                onClose={() => this.setState({editExpression: null})}
            >
                <ExpressionWidget
                    tableMetadata={this.props.tableMetadata}
                    onSetExpression={(newName, newExpression) => {
                        if (expression) {
                            // remove old expression using original name.  this accounts for case where expression is renamed.
                            console.log("removing original expression", name, expression);
                            Query.removeExpression(query, name);
                        }

                        // TODO: analytics

                        // now add the new expression to the query
                        Query.setExpression(query, newName, newExpression);
                        this.props.setQuery(this.props.query);
                        this.setState({editExpression: null});
                        console.log("set expression", newName, newExpression, this.props.query);
                    }}
                    onRemoveExpression={(removeName) => {
                        // TODO: analytics

                        Query.removeExpression(query, removeName);
                        this.props.setQuery(this.props.query);
                        this.setState({editExpression: null});
                        console.log("removed expression", removeName, this.props.query);
                    }}
                    onCancel={() => this.setState({editExpression: null})}
                    name={name}
                    expression={expression}
                />
            </Popover>
        );
    }

    render() {
        const { features, query } = this.props;
        if (!features.sort && !features.limit) {
            return;
        }

        const triggerElement = (<span className="EllipsisButton no-decoration text-grey-1 px1">…</span>);

        return (
            <div className="GuiBuilder-section GuiBuilder-sort-limit flex align-center" ref="sortLimitSection">

                <PopoverWithTrigger ref="limitSortPopover"
                                    triggerElement={triggerElement}
                                    triggerClasses="flex align-center">
                    <div className="px3 py1">
                        {this.renderSort()}

                        <Expressions
                            expressions={query.query.expressions}
                            onAddExpression={() => {
                                this.setState({editExpression: true});
                                this.refs.limitSortPopover.toggle();
                            }}
                            onEditExpression={(name) => {
                                this.setState({editExpression: name});
                                this.refs.limitSortPopover.toggle();
                            }}
                        />

                        { features.limit &&
                            <div className="py1">
                                <div className="Query-label mb1">Row limit</div>
                                <LimitWidget limit={query.query.limit} onChange={(count) => this.updateLimit(count)} />
                            </div>
                        }
                    </div>
                </PopoverWithTrigger>

                {this.renderExpressionWidget()}
            </div>
        );
    }
}
