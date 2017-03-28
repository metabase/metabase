import React, { Component } from "react";
import { connect } from "react-redux";
import cxs from "cxs";

import Card from "../components/Card";

import { normal } from "metabase/lib/colors";

import ExpressionEditorTextfield
    from "metabase/query_builder/components/expressions/ExpressionEditorTextfield.jsx";

import {
    getSelectedTableMetadata,
    getMetricsForCurrentTable,
    getCurrentStep
} from "../selectors";

import {
    selectAndAdvance,
    setAggregation,
    selectMetric,
    setTip
} from "../actions";

const aggCategories = [
    { name: "Basics", key: "basics" },
    { name: "Saved metrics", key: "saved" },
    { name: "Custom expression", key: "custom" }
];

const mapStateToProps = state => ({
    table: getSelectedTableMetadata(state),
    savedAggregations: getMetricsForCurrentTable(state),
    tip: getCurrentStep(state).tip
});

const mapDispatchToProps = {
    selectAndAdvance,
    setAggregation,
    selectMetric,
    setTip
};

class AggBasics extends Component {
    constructor() {
        super();
        this.state = {
            fields: null
        };
    }
    render() {
        const { table, onClick, setTip, clearTip } = this.props;
        return (
            <div>
                <ol
                    className={cxs({
                        display: this.state.fields ? "block" : "flex",
                        flexWrap: "wrap"
                    })}
                >
                    {this.state.fields
                        ? this.state.fields.map(field => (
                              <div
                                  onClick={() =>
                                      onClick([
                                          this.state.option,
                                          ["field-id", field.id]
                                      ])}
                              >
                                  {field.display_name}
                              </div>
                          ))
                        : Object.values(
                              table.aggregation_options
                          ).map(option => (
                              <li
                                  className={cxs({
                                      flex: "0 1 25%",
                                      padding: "1em"
                                  })}
                                  onClick={() => {
                                      if (option.requiresField) {
                                          this.setState({
                                              fields: option.fields[0],
                                              option: option.short
                                          });
                                      } else {
                                          const aggregation = option.short;
                                          onClick([aggregation]);
                                      }
                                  }}
                              >
                                  <Card>
                                      <h3>{option.name}</h3>
                                  </Card>
                              </li>
                          ))}
                </ol>
            </div>
        );
    }
}

const SavedAggregations = ({ aggregations, onClick }) => (
    <div>
        {aggregations.map(aggregation => (
            <li key={aggregation.id} onClick={() => onClick(aggregation)}>
                {aggregation.name}
            </li>
        ))}
    </div>
);

class CustomAggregation extends Component {
    constructor() {
        super();
        this.state = {
            error: undefined
        };
    }
    render() {
        const { table, onClick } = this.props;
        return (
            <div>
                <ExpressionEditorTextfield
                    tableMetadata={table}
                    expression={null}
                    onChange={aggregation => this.setState({ aggregation })}
                    onError={error => this.setState({ error })}
                    startRule="aggregation"
                />
                <button onClick={() => onClick(this.state.aggregation)}>
                    Next
                </button>
            </div>
        );
    }
}

@connect(mapStateToProps, mapDispatchToProps)
class MetricBuilderAggregation extends Component {
    constructor(props) {
        super(props);
        this.state = {
            aggCategory: "basics"
        };
        this.tip = props.tip;
    }

    renderAggregationOptions = () => {
        const {
            table,
            selectAndAdvance,
            setAggregation,
            selectMetric
        } = this.props;
        switch (this.state.aggCategory) {
            case "saved":
                return (
                    <SavedAggregations
                        aggregations={this.props.savedAggregations}
                        onClick={metric => {
                            selectAndAdvance(() => selectMetric(metric));
                        }}
                    />
                );
            case "custom":
                return (
                    <CustomAggregation
                        table={table}
                        onClick={aggregation =>
                            selectAndAdvance(() => setAggregation(aggregation))}
                    />
                );
            default:
                return (
                    <AggBasics
                        table={table}
                        setTip={this.props.setTip}
                        clearTip={() => this.props.setTip(this.tip)}
                        onClick={aggregation =>
                            selectAndAdvance(() => setAggregation(aggregation))}
                    />
                );
        }
    };

    render() {
        const { table } = this.props;
        return (
            <div>
                <h3>What do you want to know about {table.display_name}?</h3>
                <ol>
                    {aggCategories.map(({ name, key }) => (
                        <li
                            key={key}
                            style={{
                                borderBottom: `2px solid transparent`,
                                borderColor: key === this.state.aggCategory
                                    ? normal.green
                                    : "transparent",
                                display: "inline-block",
                                padding: "1em 2em",
                                cursor: "pointer"
                            }}
                            onClick={() => this.setState({ aggCategory: key })}
                        >
                            {name}
                        </li>
                    ))}
                </ol>
                {this.renderAggregationOptions()}
            </div>
        );
    }
}

export default MetricBuilderAggregation;
