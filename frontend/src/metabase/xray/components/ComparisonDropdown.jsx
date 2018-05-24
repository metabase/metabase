import React, { Component } from "react";
import { Link } from "react-router";
import Select, { Option } from "metabase/components/Select";
import Icon from "metabase/components/Icon";

const MODEL_ICONS = {
  segment: "segment",
  table: "table",
  card: "table2",
};

export class ComparisonDropdown extends Component {
  props: {
    // Models of current comparison – you can enter only the left side of comparison with an array of a single model
    models: any[],
    comparables: any[],
    updatingModelAtIndex: number,
    triggerElement?: any,
  };

  static defaultProps = {
    updatingModelAtIndex: 1,
  };

  getComparisonUrl = comparableModel => {
    const { models, updatingModelAtIndex } = this.props;

    let comparisonModels = Object.assign([...models], {
      [updatingModelAtIndex]: comparableModel,
    });

    const isSharedModelType =
      comparisonModels[0]["type-tag"] === comparisonModels[1]["type-tag"];
    if (isSharedModelType) {
      return `/xray/compare/${comparisonModels[0]["type-tag"]}s/${
        comparisonModels[0].id
      }/${comparisonModels[1].id}/approximate`;
    } else {
      return `/xray/compare/${comparisonModels[0]["type-tag"]}/${
        comparisonModels[0].id
      }/${comparisonModels[1]["type-tag"]}/${
        comparisonModels[1].id
      }/approximate`;
    }
  };

  render() {
    const { comparables, triggerElement } = this.props;

    return (
      <Select
        value={null}
        // TODO Atte Keinänen: Use links instead of this kind of logic
        triggerElement={
          triggerElement || (
            <div className="Button bg-white text-brand-hover no-decoration">
              <Icon name="compare" className="mr1" />
              {`Compare with...`}
              <Icon name="chevrondown" size={12} className="ml1" />
            </div>
          )
        }
      >
        {comparables.map((comparableModel, index) => (
          <Link
            to={this.getComparisonUrl(comparableModel)}
            className="no-decoration"
          >
            <Option
              key={index}
              value={comparableModel}
              icon={MODEL_ICONS[comparableModel["type-tag"]]}
              iconColor={"#DFE8EA"}
            >
              {comparableModel.display_name || comparableModel.name}
            </Option>
          </Link>
        ))}
      </Select>
    );
  }
}
