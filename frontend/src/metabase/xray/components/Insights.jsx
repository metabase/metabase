import React, { Component } from "react";
import { InsightCard } from "metabase/xray/components/InsightCard";

export class Insights extends Component {
  props: {
    features: any,
  };

  render() {
    const { features } = this.props;

    const parametrizedInsights = Object.entries(features["insights"]);

    return (
      <ol className="Grid Grid--gutters Grid--1of4">
        {parametrizedInsights.map(([type, props], index) => (
          <div className="Grid-cell">
            <InsightCard
              key={index}
              type={type}
              props={props}
              features={features}
            />
          </div>
        ))}
      </ol>
    );
  }
}
