import React, { Component } from 'react'

const NormalRangeInsightContents = ({ min, max, model }) =>
    <div>Normal value for { model.name } is between { min } and { max }.</div>

const GapsInsightContents = ({ "nil%": nilPercentage, quality, model }) =>
    <div>You have { quality } gaps in your data: { 100 * nilPercentage }% of datapoints are blank.</div>

const insightTypes = {
    "normal-range": { name: "Normal field value range", InsightContents: NormalRangeInsightContents },
    "gaps": { name: "Gaps in data", InsightContents: GapsInsightContents }
}

const Insight = ({type, props, model}) => {
    const insightType = insightTypes[type]
    const InsightContents = insightType.InsightContents

    return (
        <li className="Grid-cell">
            <div className="full-height">
                <div
                    className="ComparisonContributor bg-white p2 shadowed rounded bordered"
                    style={{ minHeight: "120px" }}
                >
                    <h3 className="mb2">
                        {insightType.name}
                    </h3>

                    <InsightContents {...props} model={model} />
                </div>
            </div>
        </li>
    )
}

export class Insights extends Component {
    props: {
        features: any,
    }

    render() {
        const { features } = this.props;

        const parametrizedInsights = Object.entries(features["data-stories"])
        // temporary hacks as we have two formats
            .filter(([key, value]) => !key.includes(2))
            .map(([key, value]) => [key.replace("1",""), value])

        return (
            <ol className="Grid Grid--gutters Grid--1of3">
                { parametrizedInsights.map(([type, props], index) =>
                    <Insight key={index} type={type} props={props} model={features.model} />
                )}
            </ol>
        )
    }
}

