import React, { Component } from "react";
import _ from "underscore";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";
import Icon from "metabase/components/Icon.jsx";
import CheckBox from "metabase/components/CheckBox.jsx";

import cx from "classnames";
import { getIn } from "icepick";
import type {Card} from "metabase/meta/types/Card";
import VisualizationResult from "metabase/query_builder/components/VisualizationResult";
import Utils from "metabase/lib/utils";
import Query, {AggregationClause} from "metabase/lib/query";
import MetricList from "metabase/query_builder/components/MetricList";
import {MetabaseApi} from "metabase/services";
import {getChartTypeForCard} from "metabase/query_builder/actions";

type Props = {
    onClose: () => void,
    question: Question,
    // TODO Add correct type for the query result
    result: any,
    setDatasetQuery: (datasetQuery: DatasetQuery) => void,
}

export default class SavedMetricSelector extends Component {
    props: Props;

    constructor(props, context) {
        super(props, context);

        const { question, result } = this.props;

        this.state = {
            currentResult: result,
            currentDataset: question.datasetQuery(),
            // The initial aggregations are only set when the selector view is opened
            initialMetrics: question.metrics(),
            addedMetrics: {},
            searchValue: ""
        };
    }

    updateQuestion(question) {
        this.props.setDatasetQuery(question.datasetQuery());
    }

    onSearchChange = (e) => {
        this.setState({ searchValue: e.target.value.toLowerCase() });
    };

    updateResults = () => {
        MetabaseApi.dataset(this.props.card.dataset_query).then((queryResult) => {
            // NOTE: This currently kind of enforces the recommended display type
            // which is not optimal but a working temporary hack
            this.props.question.card().display = getChartTypeForCard(this.props.card, queryResult);
            this.setState({currentResult: queryResult});
        });
    };

    addMetric = (metricWrapper) => {
        // TODO Maybe don't use global state, maintain local query instead; this code is helpful for that
        const { addedMetrics } = this.state;
        const { question } = this.props;

        this.updateQuestion(question.addSavedMetric(metricWrapper));

        this.setState({
            addedMetrics: {
                ...addedMetrics,
                [metricWrapper.id]: true
            }
        });

        setTimeout(this.updateResults, 10);
    };

    removeMetric = (metricWrapper) => {
        const { addedMetrics } = this.state;
        const { question } = this.props;

        const metrics = question.metrics();
        const index = _.findIndex(metrics, (metric) => metric.equalsToMetric(metricWrapper));

        if (index !== -1) {
            this.updateQuestion(question.removeMetric(index));
        } else {
            console.error("Removing the metric from aggregations failed");
        }

        this.setState({
            addedMetrics: _.omit(addedMetrics, metricWrapper.id)
        });

        setTimeout(this.updateResults, 10);
    };

    onToggleMetric = (metric, e) => {
        const checked = e.target.checked;

        try {
            if (checked) {
                this.addMetric(metric);
            } else {
                this.removeMetric(metric)
            }

        } catch(e) {
            console.error("onToggleMetric", e);
        }

    };

    onRemoveSeries = (card) => {
        console.log('onRemoveSeries called')
        // this.setState({ series: this.state.series.filter(c => c.id !== card.id) });
    };

    onDone = () => {
        this.props.onClose();
        // Show the result in normal QB view
        setTimeout(() => this.props.runQuery(null, { ignoreCache: true }), 100);
    };

    onClose = () => {
        this.filteredMetrics().filter((metric) => !!this.state.addedMetrics[metric.id]).forEach(this.removeMetric);
        this.props.onClose();
        // No need to update the result for normal QB here as no changes were being made
    };

    filteredMetrics = () => {
        const { question } = this.props;
        const { searchValue, initialMetrics } = this.state;

        if (!question) return [];

        return question.availableMetrics().filter(metricWrapper => {
            if (_.find(initialMetrics, (metric) => metric.equalsToMetric(metricWrapper))) {
                return false;
            }

            return !(
                searchValue &&
                (metricWrapper.name || "").toLowerCase().indexOf(searchValue) < 0 &&
                (metricWrapper.description || "").toLowerCase().indexOf(searchValue) < 0
            );
        });
    };

    render() {
        const { addedMetrics } = this.state;

        const filteredMetrics = this.filteredMetrics();
        const error = filteredMetrics.length === 0 ? new Error("Whoops, no compatible metrics match your search.") : null;
        const badMetrics = [];

        const MetricListItem = ({metric}) =>
            <li key={metric.id}
                className={cx("my1 pl2 py1 flex align-center", {disabled: badMetrics[metric.id]})}>
                <span className="px1 flex-no-shrink">
                    <CheckBox checked={addedMetrics[metric.id]}
                              onChange={this.onToggleMetric.bind(this, metric)}/>
                </span>
                <span className="px1">
                    {metric.name}
                </span>
            </li>;

        return (
            <div className="spread flex">
                <div className="flex flex-column flex-full bg-white">
                    <div className="flex-no-shrink h3 pl4 pt4 pb1 text-bold">
                        <MetricList {...this.props} hideAddButton hideClearButton />
                    </div>
                    <div className="flex-full mx1 relative">
                        <VisualizationResult
                            lastRunDatasetQuery={this.state.currentDataset}
                            // onUpdateWarnings={(warnings) => this.setState({ warnings })}
                            // onOpenChartSettings={() => this.refs.settings.open()}
                            className="spread pb1"
                            {...this.props}
                            result={this.state.currentResult}
                        />
                        {/*{ this.state.state &&*/}
                        {/*<div className="spred flex layout-centered" style={{ backgroundColor: "rgba(255,255,255,0.80)" }}>*/}
                            {/*{ this.state.state === "loading" ?*/}
                                {/*<div className="h3 rounded bordered p3 bg-white shadowed">Applying Metric</div>*/}
                                {/*: null }*/}
                        {/*</div>*/}
                        {/*}*/}
                    </div>
                </div>
                <div className="border-left flex flex-column" style={{width: 370, backgroundColor: "#F8FAFA", borderColor: "#DBE1DF" }}>
                    <div className="flex-no-shrink border-bottom flex flex-row align-center" style={{ borderColor: "#DBE1DF" }}>
                        <Icon className="ml2" name="search" size={16} />
                        <input className="h4 input full pl1" style={{ border: "none", backgroundColor: "transparent" }} type="search" placeholder="Search for a metric" onFocus={this.onSearchFocus} onChange={this.onSearchChange}/>
                    </div>
                    <LoadingAndErrorWrapper className="flex flex-full" loading={!filteredMetrics} error={error} noBackground>
                        { () =>
                            <ul className="flex-full scroll-y scroll-show pr1">
                                {filteredMetrics.map(m => <MetricListItem metric={m} />)}
                            </ul>
                        }
                    </LoadingAndErrorWrapper>
                    <div className="flex-no-shrink pr2 pb2 pt1 flex border-top" style={{ borderColor: "#DBE1DF" }}>
                        <div className="flex-full">{/* TODO: How to implement a full-width border-top without this extra component? */}</div>
                        <button data-metabase-event={"Dashboard;Edit Series Modal;cancel"} className="Button Button--borderless" onClick={this.onClose}>Cancel</button>
                        <button className="Button Button--primary" onClick={this.onDone}>Done</button>
                    </div>
                </div>
            </div>
        );
    }
}
