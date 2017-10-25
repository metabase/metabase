import React, { Component } from 'react'
import { InsightCard } from "metabase/xray/components/InsightCard";

export class Insights extends Component {
    props: {
        features: any,
    }

    render() {
        const { features } = this.props;

        const parametrizedInsights = Object.entries(features["insights"])
            // temporary hacks as we have two formats
            .filter(([key, value]) => !key.includes(2))
            .map(([key, value]) => [key.replace("1",""), value])

        return (
            <ol className="Grid Grid--gutters Grid--1of4">
                { parametrizedInsights.map(([type, props], index) =>
                    <div className="Grid-cell flex flex-column">
                        <InsightCard key={index} type={type} props={props} features={features} />
                    </div>
                )}
            </ol>
        )
    }
}
