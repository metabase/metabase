import React, { Component } from "react";
import _ from "underscore";

import Visualization from "metabase/visualizations/components/Visualization.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";
import Icon from "metabase/components/Icon.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";
import CheckBox from "metabase/components/CheckBox.jsx";

import cx from "classnames";
import { getIn } from "icepick";
import type {Card} from "metabase/meta/types/Card";
import VisualizationResult from "metabase/query_builder/components/VisualizationResult";
import Utils from "metabase/lib/utils";
import MetricWidget from "metabase/query_builder/components/MetricWidget";
import Query, {AggregationClause} from "metabase/lib/query";
import MetricList from "metabase/query_builder/components/MetricList";

export default class SavedMetricSelector extends Component {
    props: {
        onClose: () => void,
        card: Card
    };

    state = {
        currentDataset: null,
        searchValue: ""
    };

    constructor(props, context) {
        super(props, context);

        this.setState({
            currentDataset: Utils.copy(props.card.dataset_query)
        });
    }

    // TODO Maybe don't use global state, maintain local query instead; it should make this logic obsolete (copied from QueryVisualization)
    // Or at least figure out that why a local copy is taken in the first place
    componentWillReceiveProps(nextProps) {
        console.log('`isRunning` changed so updating the understanding of our current query');
        // whenever we are told that we are running a query lets update our understanding of the "current" query
        if (nextProps.isRunning) {
            this.setState({
                currentDataset: Utils.copy(this.nextProps.card.dataset_query)
            });
        }
    }

    onSearchChange = (e) => {
        this.setState({ searchValue: e.target.value.toLowerCase() });
    };

    onToggleMetric = async (metric, e) => {
        const checked = e.target.checked;

        if (checked) {
            this.props.addQueryAggregation(metric);
        } else {
            // if (AggregationClause.isMetric(aggregation)) {
            //     selectedAggregation = _.findWhere(tableMetadata.metrics, { id: AggregationClause.getMetric(aggregation) });
        }

        // TODO Maybe don't use global state, maintain local query instead; this code is helpful for that
        // const datasetQuery = Utils.copy(this.state.currentDataset.query);
        // Query.updateAggregation(card.dataset_query, metric)
    };

    onRemoveSeries = (card) => {
        console.log('onRemoveSeries called')
        // this.setState({ series: this.state.series.filter(c => c.id !== card.id) });
    };

    onDone = () => {
        // call some callback here
        this.props.onClose();
    };

    filteredMetrics = () => {
        const currentTableMetrics = getIn(this.props, ["tableMetadata", "metrics"]);

        const { datasetQuery: { query } } = this.props;
        let aggregations = Query.getAggregations(query);
        console.log("current aggregations", aggregations);

        const { card } = this.props;
        const { searchValue } = this.state;

        if (!currentTableMetrics || !card) return [];

        return currentTableMetrics.filter(metric => {
            if (_.find(aggregations, (aggregation) =>
                AggregationClause.isMetric(aggregation) && AggregationClause.getMetric(aggregation) === metric.id
            )) {
                return false;
            }

            return !(
                searchValue &&
                (metric.name || "").toLowerCase().indexOf(searchValue) < 0 &&
                (metric.description || "").toLowerCase().indexOf(searchValue) < 0
            );
        });
    };

    render() {

        const filteredMetrics = this.filteredMetrics();
        console.log("filtered metrics", filteredMetrics);
        const error = filteredMetrics.length === 0 ? new Error("Whoops, no compatible metrics match your search.") : null;
        // let enabledCards = _.indexBy(this.state.enabledMetrics, 'id').map(() => true);
        const enabledMetrics = [];
        const badMetrics = [];

        const MetricListItem = ({metric}) =>
            <li key={metric.id}
                className={cx("my1 pl2 py1 flex align-center", {disabled: badMetrics[metric.id]})}>
                <span className="px1 flex-no-shrink">
                    <CheckBox checked={enabledMetrics[metric.id]}
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
                        <input className="h4 input full pl1" style={{ border: "none", backgroundColor: "transparent" }} type="search" placeholder="Search for a question" onFocus={this.onSearchFocus} onChange={this.onSearchChange}/>
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
                        <button data-metabase-event={"Dashboard;Edit Series Modal;cancel"} className="Button Button--borderless" onClick={this.props.onClose}>Cancel</button>
                        <button className="Button Button--primary" onClick={this.onDone}>Done</button>
                    </div>
                </div>
            </div>
        );
    }
}
