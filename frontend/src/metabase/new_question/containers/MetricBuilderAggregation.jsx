import React, { Component } from "react";
import { connect } from "react-redux";

import ResponsiveList from "metabase/components/ResponsiveList";

import ExpressionEditorTextfield
    from "metabase/query_builder/components/expressions/ExpressionEditorTextfield.jsx";

import {
    getSelectedTableMetadata,
    getMetricsForCurrentTable,
    getCurrentStep
} from "../selectors";

import { selectAndAdvance, setAggregation, selectMetric } from "../actions";

const mapStateToProps = state => ({
    table: getSelectedTableMetadata(state),
    savedAggregations: getMetricsForCurrentTable(state),
    tip: getCurrentStep(state).tip
});

const mapDispatchToProps = {
    selectAndAdvance,
    setAggregation,
    selectMetric
};

class AggBasics extends Component {
    state = {
        fields: null
    };

    render() {
        const { table, onClick } = this.props;
        return (
            <div>
                {this.state.fields
                    ? <ResponsiveList
                          items={this.state.fields}
                          onClick={field =>
                              onClick([
                                  this.state.option,
                                  ["field-id", field.id]
                              ])}
                      />
                    : <ResponsiveList
                          items={Object.values(
                              table.aggregation_options
                          ).filter(
                              option => option.short !== "rows"
                              // raw data isn't a thing here
                          )}
                          onClick={option => {
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
                      />}

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
                        onClick={aggregation =>
                            this.setState({ expression: aggregation })}
                    />}
            </div>
        );
    }
}

/*
this.state.fields.map(field => (
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

*/
export default MetricBuilderAggregation;
