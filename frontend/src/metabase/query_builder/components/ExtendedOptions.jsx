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
import { CardApi } from "metabase/services";
import { cancelable } from "metabase/lib/promise";

export default class ExtendedOptions extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
          isOpen: false,
          editExpression: null,
          cache_ttl: (!this.props.card || !this.props.card.name) ? 0 : (this.props.card.cache_ttl ? this.props.card.cache_ttl : 0)
        };

        _.bindAll(this, "onSave", "onGoBack", "handleChangeCacheTTL", "handleSubmitCacheTTL");
    }



    static propTypes = {
        card: PropTypes.object,
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


    onSave(data) {
        // MBQL->NATIVE
        // if we are a native query with an MBQL query definition, remove the old MBQL stuff (happens when going from mbql -> native)
        // if (card.dataset_query.type === "native" && card.dataset_query.query) {
        //     delete card.dataset_query.query;
        // } else if (card.dataset_query.type === "query" && card.dataset_query.native) {
        //     delete card.dataset_query.native;
        // }

        if (this.props.card.dataset_query.query) {
            Query.cleanQuery(this.props.card.dataset_query.query);
        }

        // TODO: reduxify
        this.requesetPromise = cancelable(CardApi.update(data));
        return this.requesetPromise.then(updatedCard => {
            if (this.props.fromUrl) {
                this.onGoBack();
                return;
            }

            this.props.notifyCardUpdatedFn(updatedCard);
        });
    }

    handleChangeCacheTTL(event) {
      this.setState({cache_ttl: event.target.value});
    }

    handleSubmitCacheTTL() {
      this.onSave({id: this.props.card.id,
                   cache_ttl: +this.state.cache_ttl > 0 ? (+this.state.cache_ttl)*60 : null});
      this.setState({ isOpen: false });
    }

    onGoBack() {
        this.props.onChangeLocation(this.props.fromUrl || "/");
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

        const { card, features, datasetQuery, tableMetadata, settingValues } = this.props;
        console.log(card);
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

                    { settingValues['enable-query-caching'] && card && card.name &&
                        <div>
                            <br/>
                            <div className="mb1 h6 text-uppercase text-grey-3 text-bold">Cache TTL, minutes (0 - defaults)</div>
                            <div className="flex align-center">
                              <input className="input block border-gray" type="text" defaultValue={card.cache_ttl ? card.cache_ttl/60 : 0} onChange={(e) => this.handleChangeCacheTTL(e)}/>
                              <span className="Header-buttonSection borderless">
                                <a className="ml1 cursor-pointer text-brand-hover text-grey-4 text-uppercase" onClick={this.handleSubmitCacheTTL}>DONE</a>
                              </span>
                            </div>
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
