import React, { Component, PropTypes } from "react";
import _ from "underscore";
import cx from "classnames";

import AddClauseButton from "./AddClauseButton.jsx";
import Expressions from "./expressions/Expressions.jsx";
import ExpressionWidget from './expressions/ExpressionWidget.jsx';
import LimitWidget from "./LimitWidget.jsx";
import SortWidget from "./SortWidget.jsx";
import Parameters from "./parameters/Parameters.jsx";
import ParameterWidget from "./parameters/ParameterWidget.jsx";
import Popover from "metabase/components/Popover.jsx";

import MetabaseAnalytics from "metabase/lib/analytics";
import Query from "metabase/lib/query";


export default class ExtendedOptions extends Component {

    constructor(props, context) {
        super(props, context);

        this.state = {
            isOpen: false,
            editExpression: null,
            editParameter: null
        };

        _.bindAll(
            this,
            "setLimit", "addSort", "updateSort", "removeSort"
        );
    }

    static propTypes = {
        features: PropTypes.object.isRequired,
        query: PropTypes.object.isRequired,
        tableMetadata: PropTypes.object,
        setQuery: PropTypes.func.isRequired
    };

    static defaultProps = {
        expressions: {},
        parameters: []
    };


    setLimit(limit) {
        if (limit) {
            Query.updateLimit(this.props.query.query, limit);
            MetabaseAnalytics.trackEvent('QueryBuilder', 'Set Limit');
        } else {
            Query.removeLimit(this.props.query.query);
            MetabaseAnalytics.trackEvent('QueryBuilder', 'Remove Limit');
        }
        this.props.setQuery(this.props.query);
        this.setState({isOpen: false});
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

    setExpression(name, expression, previousName) {
        let query = this.props.query.query;

        if (!_.isEmpty(previousName)) {
            // remove old expression using original name.  this accounts for case where expression is renamed.
            Query.removeExpression(query, previousName);
        }

        // now add the new expression to the query
        Query.setExpression(query, name, expression);
        this.props.setQuery(this.props.query);
        this.setState({editExpression: null});

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Set Expression', !_.isEmpty(previousName));
    }

    removeExpression(name) {
        let scrubbedQuery = Query.removeExpression(this.props.query.query, name);
        this.props.query.query = scrubbedQuery;
        this.props.setQuery(this.props.query);
        this.setState({editExpression: null});

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Remove Expression');
    }

    setParameter(parameter, previousName) {
        console.log("setting parameter", parameter, previousName);
        
        let parameters = this.props.query.parameters || [];
        
        if (!_.isEmpty(previousName)) {
            // remove old expression using original name.  this accounts for case where parameter is renamed.
            parameters = _.reject(parameters, (p) => p.name === previousName);
        }

        // now add the new parameter
        parameters = [...parameters, parameter];
        this.props.query.parameters = parameters;
        this.props.setQuery(this.props.query);
        this.setState({editParameter: null});

        console.log("parameters", this.props.query.parameters);

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Set Parameter', !_.isEmpty(previousName));
    }

    removeParameter(parameter) {
        console.log("remove parameter", parameter);

        let parameters = this.props.query.parameters || [];
        parameters = _.reject(parameters, (p) => p.name === parameter.name);
        this.props.query.parameters = parameters;
        this.props.setQuery(this.props.query);
        this.setState({editParameter: null});

        console.log("parameters", this.props.query.parameters);

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Remove Parameter');
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
                <div className="pb3">
                    <div className="pb1 h6 text-uppercase text-grey-3 text-bold">Sort</div>
                    {content}
                </div>
            );
        }
    }

    renderExpressionWidget() {
        // if we aren't editing any expression then there is nothing to do
        if (!this.state.editExpression || !this.props.tableMetadata) return null;

        const query = this.props.query.query,
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

    renderParametersWidget() {
        // if we aren't editing any parameter then there is nothing to do
        if (!this.state.editParameter || !this.props.tableMetadata) return null;

        const parameters = this.props.query.parameters,
              parameter = parameters && _.find(parameters, (p) => p.name === this.state.editParameter),
              name = _.isString(this.state.editParameter) ? this.state.editParameter : "";

        // TODO: at some point we need to prevent the add parameter button if there are none possible?
        // TODO: pass in names that aren't allowed to be used (to prevent dupes)
        return (
            <Popover onClose={() => this.setState({editParameter: null})}>
                <ParameterWidget
                    parameter={parameter}
                    tableMetadata={this.props.tableMetadata}
                    onSetParameter={(newParameter) => this.setParameter(newParameter, name)}
                    onRemoveParameter={(parameter) => this.removeParameter(parameter)}
                    onCancel={() => this.setState({editParameter: null})}
                />
            </Popover>
        );
    }

    renderPopover() {
        if (!this.state.isOpen) return null;

        const { features, query, tableMetadata } = this.props;

        return (
            <Popover onClose={() => this.setState({isOpen: false})}>
                <div className="p3">
                    {this.renderSort()}

                    {_.contains(tableMetadata.db.features, "expressions") ?
                        <Expressions
                            expressions={query.query.expressions}
                            tableMetadata={tableMetadata}
                            onAddExpression={() => this.setState({isOpen: false, editExpression: true})}
                            onEditExpression={(name) => {
                                this.setState({isOpen: false, editExpression: name});
                                MetabaseAnalytics.trackEvent("QueryBuilder", "Show Edit Custom Field");
                            }}
                        />
                    : null}

                    <Parameters
                        parameters={query.parameters}
                        tableMetadata={tableMetadata}
                        onAddParameter={() => this.setState({isOpen: false, editParameter: true})}
                        onEditParameter={(name) => {
                            this.setState({isOpen: false, editParameter: name});
                            MetabaseAnalytics.trackEvent("QueryBuilder", "Show Edit Parameter");
                        }}
                    />

                    { features.limit &&
                        <div>
                            <div className="mb1 h6 text-uppercase text-grey-3 text-bold">Row limit</div>
                            <LimitWidget limit={query.query.limit} onChange={this.setLimit} />
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
                {this.renderParametersWidget()}
            </div>
        );
    }
}
