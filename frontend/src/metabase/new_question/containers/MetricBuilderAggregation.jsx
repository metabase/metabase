import React, { Component } from "react";
import { connect } from "react-redux";
import cxs from "cxs";

import Card from "../components/Card";
import Surface from "metabase/components/Surface";
import ResponsiveList from "metabase/components/ResponsiveList";

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
                        : Object.values(table.aggregation_options)
                              .filter(
                                  option => option.short !== "rows"
                                  // raw data isn't a thing here
                              )
                              .map(option => (
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
            <ExpressionEditorTextfield
                tableMetadata={table}
                expression={this.props.expression}
                onChange={aggregation => this.setState({ aggregation })}
                onError={error => this.setState({ error })}
                startRule="aggregation"
                placeholder={this.props.placeholder}
            />
        );
    }
}

@connect(mapStateToProps, mapDispatchToProps)
class MetricBuilderAggregation extends Component {
    constructor(props) {
        super(props);
        this.tip = props.tip;
        this.state = {
            expression: null
        };
    }

    render() {
        const {
            table,
            selectAndAdvance,
            setAggregation,
            selectMetric
        } = this.props;
        const { expression } = this.state;
        return (
            <div>
                <div className="flex">
                    <div className="flex-full">
                        <CustomAggregation
                            table={table}
                            onClick={aggregation =>
                                selectAndAdvance(() =>
                                    setAggregation(aggregation))}
                            expression={expression}
                            placeholder={
                                `What do you want to know about ${table.display_name}?`
                            }
                        />
                    </div>
                    <button
                        className="Button Button--primary"
                        onClick={() =>
                            selectAndAdvance(() =>
                                setAggregation(this.state.expression))}
                    >
                        Next
                    </button>
                </div>
                {!expression &&
                    <AggBasics
                        table={table}
                        setTip={this.props.setTip}
                        clearTip={() => this.props.setTip(this.tip)}
                        onClick={aggregation =>
                            this.setState({ expression: aggregation })}
                    />}
            </div>
        );
    }
}

export default MetricBuilderAggregation;
