import React, { Component } from 'react'
import { Link } from "react-router";
import Select, { Option } from "metabase/components/Select";
import Icon from "metabase/components/Icon";

export class ComparisonDropdown extends Component {
    props: {
        // Models of current comparison – you can enter only the left side of comparison with an array of a single model
        models: any[],
        comparables: any[]
    }

    getComparisonUrl = (comparableModel) => {
        const { models } = this.props

        let comparisonModels = Object.assign([...models], { 1: comparableModel })

        if (comparisonModels[0]["type-tag"] === comparisonModels[1]["type-tag"]) {
            return `/xray/compare/${comparisonModels[0]["type-tag"]}s/${comparisonModels[0].id}/${comparisonModels[1].id}/approximate`
        } else {
            if (comparisonModels[0]["type-tag"] === "table") comparisonModels = comparisonModels.reverse()
            return `/xray/compare/${comparisonModels[0]["type-tag"]}/${comparisonModels[0].id}/${comparisonModels[1]["type-tag"]}/${comparisonModels[1].id}/approximate`
        }
    }

    render() {
        const { comparables } = this.props;

        return (
            <Select
                value={null}
                // TODO Atte Keinänen: Use links instead of this kind of logic
                triggerElement={
                    <div className="Button bg-white text-brand-hover no-decoration">
                        <Icon name="compare" className="mr1" />
                        {`Compare with...`}
                        <Icon name="chevrondown" size={12} className="ml1" />
                    </div>
                }
            >
                { comparables
                // NOTE: filter out card comparisons because we don't support those yet
                    .filter((comparableModel) => !comparableModel["type-tag"].includes("card"))
                    .map((comparableModel, index) =>
                        <Link to={this.getComparisonUrl(comparableModel)} className="no-decoration">
                            <Option
                                key={index}
                                value={comparableModel}
                            >
                                {comparableModel.name}
                            </Option>
                        </Link>
                    )}
            </Select>
        )
    }
}