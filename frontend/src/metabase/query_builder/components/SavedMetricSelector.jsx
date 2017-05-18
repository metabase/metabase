import React, { Component } from "react";

import Visualization from "metabase/visualizations/components/Visualization.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";
import Icon from "metabase/components/Icon.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";
import CheckBox from "metabase/components/CheckBox.jsx";

import cx from "classnames";
import { getIn } from "icepick";
import type {Card} from "metabase/meta/types/Card";

export default class AddSeriesModal extends Component {
    props: {
        onClose: () => void,
        card: Card
    };

    state = {

    };

    onSearchChange = (e) => {
        this.setState({ searchValue: e.target.value.toLowerCase() });
    };

    onCardChange = async (card, e) => {
        // const checked = e.target.checked;
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
        const { metrics, card } = this.props;
        const { searchValue } = this.state;

        if (!metrics || !card) return [];

        return metrics.filter(metric => {
                // filter out the active metrics somehow
                // if (card.id === card.id) {
                //     return false;
                // }

                // search
                return !(searchValue && card.name.toLowerCase().indexOf(searchValue) < 0);

        });
    };

    render() {
        const { metrics } = this.props;

        const filteredMetrics = this.filteredMetrics();
        const error = filteredMetrics.length === 0 ? new Error("Whoops, no compatible questions match your search.") : null;
        // let enabledCards = _.indexBy(this.state.enabledMetrics, 'id').map(() => true);
        const enabledMetrics = [];
        const badMetrics = [];

        const MetricListItem = metric =>
            <li key={metric.id}
                className={cx("my1 pl2 py1 flex align-center", {disabled: badMetrics[metric.id]})}>
                <span className="px1 flex-no-shrink">
                    <CheckBox checked={enabledMetrics[metric.id]}
                              onChange={this.onCardChange.bind(this, metric)}/>
                </span>
                <span className="px1">
                    {metric.name}
                </span>
            </li>;

        return (
            <div className="spread flex">
                <div className="flex flex-column flex-full">
                    <div className="flex-no-shrink h3 pl4 pt4 pb1 text-bold">Current metrics come here</div>
                    <div className="flex-full mx1 relative">
                        {/* Should QueryVisualization be used here? */}
                        {/*<Visualization*/}
                            {/*className="spread"*/}
                            {/*series={[]}*/}
                            {/*showTitle*/}
                            {/*isDashboard*/}
                            {/*isMultiseries*/}
                            {/*onRemoveSeries={this.onRemoveSeries}*/}
                        {/*/>*/}
                        {/*{ this.state.state &&*/}
                        {/*<div className="spred flex layout-centered" style={{ backgroundColor: "rgba(255,255,255,0.80)" }}>*/}
                            {/*{ this.state.state === "loading" ?*/}
                                {/*<div className="h3 rounded bordered p3 bg-white shadowed">Applying Metric</div>*/}
                                {/*: null }*/}
                        {/*</div>*/}
                        {/*}*/}
                    </div>
                    <div className="flex-no-shrink pl4 pb4 pt1">
                        <button className="Button Button--primary" onClick={this.onDone}>Done</button>
                        <button data-metabase-event={"Dashboard;Edit Series Modal;cancel"} className="Button Button--borderless" onClick={this.props.onClose}>Cancel</button>
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
                </div>
            </div>
        );
    }
}
