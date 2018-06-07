import React, { Component } from "react";
import ReactDOM from "react-dom";
import PropTypes from "prop-types";
import { t } from "c-3po";
import AccordianList from "metabase/components/AccordianList.jsx";
import FieldList from "./FieldList.jsx";
import QueryDefinitionTooltip from "./QueryDefinitionTooltip.jsx";

import Icon from "metabase/components/Icon.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";
import Button from "metabase/components/Button.jsx";

import Query, { AggregationClause, NamedClause } from "metabase/lib/query";

import _ from "underscore";

import ExpressionEditorTextfield from "./expressions/ExpressionEditorTextfield.jsx";

const CUSTOM_SECTION_NAME = t`Custom Expression`;
const METRICS_SECTION_NAME = t`Common Metrics`;

export default class AggregationPopover extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      aggregation: props.isNew ? [] : props.aggregation,
      choosingField:
        props.aggregation &&
        props.aggregation.length > 1 &&
        AggregationClause.isStandard(props.aggregation),
      editingAggregation:
        props.aggregation &&
        props.aggregation.length > 1 &&
        AggregationClause.isCustom(props.aggregation),
    };

    _.bindAll(
      this,
      "commitAggregation",
      "onPickAggregation",
      "onPickField",
      "onClearAggregation",
    );
  }

  static propTypes = {
    isNew: PropTypes.bool,
    aggregation: PropTypes.array,
    onCommitAggregation: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
    tableMetadata: PropTypes.object.isRequired,
    datasetQuery: PropTypes.object,
    customFields: PropTypes.object,
    availableAggregations: PropTypes.array,
    // Restricts the shown options to contents of `availableActions` only
    showOnlyProvidedAggregations: PropTypes.bool,
  };

  componentDidUpdate() {
    if (this._header) {
      const { height } = ReactDOM.findDOMNode(
        this._header,
      ).getBoundingClientRect();
      if (height !== this.state.headerHeight) {
        this.setState({ headerHeight: height });
      }
    }
  }

  commitAggregation(aggregation) {
    this.props.onCommitAggregation(aggregation);
    this.props.onClose();
  }

  onPickAggregation(agg) {
    // check if this aggregation requires a field, if so then force user to pick that now, otherwise we are done
    if (agg.custom) {
      this.setState({
        aggregation: agg.value,
        editingAggregation: true,
      });
    } else if (agg.aggregation && agg.aggregation.requiresField) {
      this.setState({
        aggregation: agg.value,
        choosingField: true,
      });
    } else {
      // this includse picking a METRIC or picking an aggregation which doesn't require a field
      this.commitAggregation(agg.value);
    }
  }

  onPickField(fieldId) {
    this.commitAggregation(
      AggregationClause.setField(this.state.aggregation, fieldId),
    );
  }

  onClearAggregation() {
    this.setState({
      choosingField: false,
      editingAggregation: false,
    });
  }

  getAvailableAggregations() {
    const { availableAggregations, query } = this.props;
    return availableAggregations || query.table().aggregations();
  }

  getCustomFields() {
    const { customFields, datasetQuery } = this.props;
    return (
      customFields || (datasetQuery && Query.getExpressions(datasetQuery.query))
    );
  }

  itemIsSelected(item) {
    const { aggregation } = this.props;
    return item.isSelected(NamedClause.getContent(aggregation));
  }

  renderItemExtra(item, itemIndex) {
    if (item.aggregation && item.aggregation.description) {
      return (
        <div className="p1">
          <Tooltip tooltip={item.aggregation.description}>
            <span className="QuestionTooltipTarget" />
          </Tooltip>
        </div>
      );
    } else if (item.metric) {
      return this.renderMetricTooltip(item.metric);
    }
  }

  renderMetricTooltip(metric) {
    let { tableMetadata } = this.props;
    return (
      <div className="p1">
        <Tooltip
          tooltip={
            <QueryDefinitionTooltip
              type="metric"
              object={metric}
              tableMetadata={tableMetadata}
            />
          }
        >
          <span className="QuestionTooltipTarget" />
        </Tooltip>
      </div>
    );
  }

  render() {
    const { query, tableMetadata, showOnlyProvidedAggregations } = this.props;

    const customFields = this.getCustomFields();
    const availableAggregations = this.getAvailableAggregations();

    const { choosingField, editingAggregation } = this.state;
    const aggregation = NamedClause.getContent(this.state.aggregation);

    let selectedAggregation;
    if (AggregationClause.isMetric(aggregation)) {
      selectedAggregation = _.findWhere(tableMetadata.metrics, {
        id: AggregationClause.getMetric(aggregation),
      });
    } else if (AggregationClause.getOperator(aggregation)) {
      selectedAggregation = _.findWhere(availableAggregations, {
        short: AggregationClause.getOperator(aggregation),
      });
    }

    let sections = [];
    let customExpressionIndex = null;

    if (availableAggregations.length > 0) {
      sections.push({
        name: showOnlyProvidedAggregations ? null : t`Metabasics`,
        items: availableAggregations.map(aggregation => ({
          name: aggregation.name,
          value: [aggregation.short].concat(
            aggregation.fields.map(field => null),
          ),
          isSelected: agg =>
            !AggregationClause.isCustom(agg) &&
            AggregationClause.getAggregation(agg) === aggregation.short,
          aggregation: aggregation,
        })),
        icon: showOnlyProvidedAggregations ? null : "table2",
      });
    }

    if (!showOnlyProvidedAggregations) {
      // we only want to consider active metrics, with the ONE exception that if the currently selected aggregation is a
      // retired metric then we include it in the list to maintain continuity
      let metrics =
        tableMetadata.metrics &&
        tableMetadata.metrics.filter(
          mtrc =>
            mtrc.archived === false ||
            (selectedAggregation && selectedAggregation.id === mtrc.id),
        );
      if (metrics && metrics.length > 0) {
        sections.push({
          name: METRICS_SECTION_NAME,
          items: metrics.map(metric => ({
            name: metric.name,
            value: ["METRIC", metric.id],
            isSelected: aggregation =>
              AggregationClause.getMetric(aggregation) === metric.id,
            metric: metric,
          })),
          icon: "staroutline",
        });
      }

      customExpressionIndex = sections.length;
      if (tableMetadata.db.features.indexOf("expression-aggregations") >= 0) {
        sections.push({
          name: CUSTOM_SECTION_NAME,
          icon: "sum",
        });
      }
    }

    if (sections.length === 1) {
      sections[0].name = null;
    }

    if (editingAggregation) {
      return (
        <div style={{ width: editingAggregation ? 500 : 300 }}>
          <div className="text-grey-3 p1 py2 border-bottom flex align-center">
            <a
              className="cursor-pointer flex align-center"
              onClick={this.onClearAggregation}
            >
              <Icon name="chevronleft" size={18} />
              <h3 className="inline-block pl1">{CUSTOM_SECTION_NAME}</h3>
            </a>
          </div>
          <div className="p1">
            <ExpressionEditorTextfield
              startRule="aggregation"
              expression={aggregation}
              tableMetadata={tableMetadata}
              customFields={customFields}
              onChange={parsedExpression =>
                this.setState({
                  aggregation: NamedClause.setContent(
                    this.state.aggregation,
                    parsedExpression,
                  ),
                  error: null,
                })
              }
              onError={errorMessage =>
                this.setState({
                  error: errorMessage,
                })
              }
            />
            {this.state.error != null &&
              (Array.isArray(this.state.error) ? (
                this.state.error.map(error => (
                  <div
                    className="text-error mb1"
                    style={{ whiteSpace: "pre-wrap" }}
                  >
                    {error.message}
                  </div>
                ))
              ) : (
                <div className="text-error mb1">{this.state.error.message}</div>
              ))}
            <input
              className="input block full my1"
              value={NamedClause.getName(this.state.aggregation)}
              onChange={e =>
                this.setState({
                  aggregation: e.target.value
                    ? NamedClause.setName(aggregation, e.target.value)
                    : aggregation,
                })
              }
              placeholder={t`Name (optional)`}
            />
            <Button
              className="full"
              primary
              disabled={this.state.error}
              onClick={() => this.commitAggregation(this.state.aggregation)}
            >
              {t`Done`}
            </Button>
          </div>
        </div>
      );
    } else if (choosingField) {
      const [agg, fieldId] = aggregation;
      return (
        <div style={{ minWidth: 300 }}>
          <div
            ref={_ => (this._header = _)}
            className="text-grey-3 p1 py2 border-bottom flex align-center"
          >
            <a
              className="cursor-pointer flex align-center"
              onClick={this.onClearAggregation}
            >
              <Icon name="chevronleft" size={18} />
              <h3 className="inline-block pl1">{selectedAggregation.name}</h3>
            </a>
          </div>
          <FieldList
            className={"text-green"}
            maxHeight={this.props.maxHeight - (this.state.headerHeight || 0)}
            tableMetadata={tableMetadata}
            field={fieldId}
            fieldOptions={query.aggregationFieldOptions(agg)}
            customFieldOptions={customFields}
            onFieldChange={this.onPickField}
            enableSubDimensions={false}
          />
        </div>
      );
    } else {
      return (
        <AccordianList
          className="text-green"
          maxHeight={this.props.maxHeight}
          sections={sections}
          onChange={this.onPickAggregation}
          itemIsSelected={this.itemIsSelected.bind(this)}
          renderSectionIcon={s => <Icon name={s.icon} size={18} />}
          renderItemExtra={this.renderItemExtra.bind(this)}
          getItemClasses={item =>
            item.metric && item.metric.archived ? "text-grey-3" : null
          }
          onChangeSection={index => {
            if (index === customExpressionIndex) {
              this.onPickAggregation({
                custom: true,
                value:
                  aggregation !== "rows" && !_.isEqual(aggregation, ["rows"])
                    ? aggregation
                    : null,
              });
            }
          }}
        />
      );
    }
  }
}
