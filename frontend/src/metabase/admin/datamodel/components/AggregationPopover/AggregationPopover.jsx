import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";
import ReactDOM from "react-dom";
import { t } from "ttag";
import _ from "underscore";

import Tooltip from "metabase/core/components/Tooltip";
import CS from "metabase/css/core/index.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";
import { ExpressionWidget } from "metabase/query_builder/components/expressions/ExpressionWidget";
import { ExpressionWidgetHeader } from "metabase/query_builder/components/expressions/ExpressionWidgetHeader";
import { Icon, Box } from "metabase/ui";
import Aggregation from "metabase-lib/v1/queries/structured/Aggregation";
import * as AGGREGATION from "metabase-lib/v1/queries/utils/aggregation";

import { QueryDefinitionTooltip } from "../QueryDefinitionTooltip";

import {
  AggregationItemList,
  AggregationFieldList,
} from "./AggregationPopover.styled";

const COMMON_SECTION_NAME = t`Common Metrics`;
const BASIC_SECTION_NAME = t`Basic Metrics`;
const CUSTOM_SECTION_NAME = t`Custom Expression`;

const COMMON_AGGREGATIONS = new Set(["count"]);

/**
 * @deprecated use MLv2 + metabase/common/components/AggregationPicker
 */
export class AggregationPopover extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      aggregation: props.aggregation || [],
      choosingField:
        props.aggregation &&
        props.aggregation.length > 1 &&
        AGGREGATION.isStandard(props.aggregation),
      editingAggregation:
        props.aggregation &&
        props.aggregation.length > 1 &&
        (AGGREGATION.isCustom(props.aggregation) ||
          AGGREGATION.isNamed(props.aggregation)),
    };
  }

  static propTypes = {
    aggregation: PropTypes.array,
    onChangeAggregation: PropTypes.func.isRequired,
    onClose: PropTypes.func,

    query: PropTypes.object,

    // passing a dimension disables the field picker and only shows relevant aggregations
    dimension: PropTypes.object,

    aggregationOperators: PropTypes.array,

    showCustom: PropTypes.bool,
    showMetrics: PropTypes.bool,
    showRawData: PropTypes.bool,

    width: PropTypes.number,
    maxHeight: PropTypes.number,
    alwaysExpanded: PropTypes.bool,
  };

  static defaultProps = {
    showCustom: true,
    showMetrics: true,
    width: 300,
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

  commitAggregation = aggregation => {
    this.props.onChangeAggregation(aggregation);
    if (this.props.onClose) {
      this.props.onClose();
    }
  };

  _getAggregation() {
    const { aggregation, query } = this.props;
    if (aggregation && !(aggregation instanceof Aggregation)) {
      return new Aggregation(aggregation, null, query);
    } else {
      return aggregation;
    }
  }

  onPickAggregation = item => {
    const { dimension } = this.props;
    const aggregation = this._getAggregation();

    if (dimension) {
      if (item.aggregation?.requiresField) {
        this.commitAggregation(
          AGGREGATION.setField(item.value, dimension.mbql()),
        );
      }
    } else if (item.custom) {
      // use the existing aggregation if it's valid
      const value = aggregation?.isValid() ? aggregation : null;
      this.setState({
        aggregation: value,
        editingAggregation: true,
      });
    } else if (item.aggregation?.requiresField) {
      // check if this aggregation requires a field, if so then force user to pick that now, otherwise we are done
      this.setState({
        aggregation: item.value,
        choosingField: true,
      });
    } else {
      // this includes picking a METRIC or picking an aggregation which doesn't require a field
      this.commitAggregation(item.value);
    }
  };

  onPickField = fieldId => {
    this.commitAggregation(
      AGGREGATION.setField(this.state.aggregation, fieldId),
    );
  };

  onClearAggregation = () => {
    this.setState({
      choosingField: false,
      editingAggregation: false,
    });
  };

  _getAvailableAggregations() {
    const { aggregationOperators, query, dimension, showRawData } = this.props;
    return (
      aggregationOperators ||
      dimension?.aggregationOperators() ||
      query.aggregationOperators()
    ).filter(
      aggregationOperator =>
        showRawData || aggregationOperator.short !== "rows",
    );
  }

  itemIsSelected(item) {
    const { aggregation } = this.props;
    return item.isSelected(AGGREGATION.getContent(aggregation));
  }

  renderItemExtra(item) {
    let content;
    if (item.aggregation?.description) {
      content = item.aggregation.description;
    } else if (item.metric) {
      content = <QueryDefinitionTooltip type="metric" object={item.metric} />;
    } else {
      content = null;
    }

    return (
      content && (
        <Box p="0.5rem">
          <Tooltip tooltip={content}>
            <span className={QueryBuilderS.QuestionTooltipTarget} />
          </Tooltip>
        </Box>
      )
    );
  }

  getSections(table, selectedAggregation) {
    const { alwaysExpanded, dimension, showCustom } = this.props;
    const aggregationItems = this.getAggregationItems();
    const metricItems = this.getMetricItems(table, selectedAggregation);

    const sections = [];

    const maybeOverriddenShowCustomProp =
      dimension || !table.database.hasFeature("expression-aggregations")
        ? false
        : showCustom;

    // "Basic Metrics", e.x. count, sum, avg, etc
    if (aggregationItems.length > 0) {
      sections.push({
        name: BASIC_SECTION_NAME,
        icon: "table2",
        items: aggregationItems,
      });
    }

    // "Common Metrics" a.k.a. saved metrics
    if (metricItems.length > 0) {
      sections.push({
        name: COMMON_SECTION_NAME,
        icon: "star",
        items: metricItems,
      });
    }

    // slightly different layout of "basic" and "common" metrics for alwaysExpanded=true
    if (alwaysExpanded && sections.length > 1) {
      const [commonAggregationItems, basicAggregationItems] = _.partition(
        aggregationItems,
        item => COMMON_AGGREGATIONS.has(item.aggregation.short),
      );

      // move COMMON_AGGREGATIONS into the "common metrics" section
      sections[0].items = basicAggregationItems;
      sections[1].items = [...commonAggregationItems, ...metricItems];

      // swap the order of the sections so "common metrics" are first
      sections.reverse();
    }

    if (maybeOverriddenShowCustomProp) {
      // add "custom" as it's own section
      sections.push({
        name: CUSTOM_SECTION_NAME,
        icon: "sum",
        custom: true,
      });
      if (alwaysExpanded) {
        sections[sections.length - 1].items = [
          {
            name: t`Custom…`,
            custom: true,
            isSelected: agg => AGGREGATION.isCustom(agg),
          },
        ];
      }
    }

    if (sections.length === 1) {
      sections[0].name = null;
    }

    return sections;
  }

  getSelectedAggregation(table, aggregation) {
    const aggregationOperators = this._getAvailableAggregations();

    if (AGGREGATION.isMetric(aggregation)) {
      return _.findWhere(table.metrics, {
        id: AGGREGATION.getMetric(aggregation),
      });
    }

    return _.findWhere(aggregationOperators, {
      short: AGGREGATION.getOperator(aggregation),
    });
  }

  getAggregationItems() {
    const { dimension } = this.props;
    const aggregationOperators = this._getAvailableAggregations();

    return aggregationOperators.map(aggregation => ({
      name: dimension
        ? aggregation.name.replace("of ...", "")
        : aggregation.name,
      value: [aggregation.short, ...aggregation.fields.map(field => null)],
      isSelected: agg =>
        AGGREGATION.isStandard(agg) &&
        AGGREGATION.getOperator(agg) === aggregation.short,
      aggregation: aggregation,
    }));
  }

  getMetrics(table, selectedAggregation) {
    const { dimension, showMetrics } = this.props;
    const maybeOverriddenShowMetrics = dimension ? false : showMetrics;

    // we only want to consider active metrics, with the ONE exception that if the currently selected aggregation is a
    // retired metric then we include it in the list to maintain continuity
    const filter = metric =>
      maybeOverriddenShowMetrics &&
      (!metric.archived || selectedAggregation?.id === metric.id);

    if (table.metrics) {
      return table.metrics.filter(filter);
    }

    return [];
  }

  getMetricItems(table, selectedAggregation) {
    const metrics = this.getMetrics(table, selectedAggregation);

    return metrics.map(metric => ({
      name: metric.name,
      value: ["metric", metric.id],
      isSelected: aggregation =>
        AGGREGATION.getMetric(aggregation) === metric.id,
      metric: metric,
    }));
  }

  onChangeExpression = (name, expression) => {
    const aggregation = AGGREGATION.setName(expression, name);

    this.setState({ aggregation });
    this.commitAggregation(aggregation);
  };

  render() {
    const { query: legacyQuery } = this.props;
    const table = legacyQuery.table();
    const { choosingField, editingAggregation } = this.state;
    const aggregation = AGGREGATION.getContent(this.state.aggregation);
    const selectedAggregation = this.getSelectedAggregation(table, aggregation);
    const sections = this.getSections(table, selectedAggregation);

    if (editingAggregation) {
      return (
        <ExpressionWidget
          name={AGGREGATION.getName(this.state.aggregation)}
          query={legacyQuery.question().query()}
          stageIndex={-1}
          legacyQuery={legacyQuery}
          expression={aggregation}
          withName
          startRule="aggregation"
          header={<ExpressionWidgetHeader onBack={this.onClearAggregation} />}
          onChangeExpression={this.onChangeExpression}
          onClose={this.onClearAggregation}
        />
      );
    }

    if (choosingField) {
      const [agg, fieldId] = aggregation;
      return (
        <div style={{ minWidth: 300 }}>
          <div
            ref={_ => (this._header = _)}
            className={cx(
              CS.textMedium,
              CS.p1,
              CS.py2,
              CS.borderBottom,
              CS.flex,
              CS.alignCenter,
            )}
          >
            <a
              className={cx(CS.cursorPointer, CS.flex, CS.alignCenter)}
              onClick={this.onClearAggregation}
            >
              <Icon name="chevronleft" size={18} />
              <h3 className={cx(CS.inlineBlock, CS.pl1)}>
                {selectedAggregation.name}
              </h3>
            </a>
          </div>
          <AggregationFieldList
            width={this.props.width}
            maxHeight={this.props.maxHeight - (this.state.headerHeight || 0)}
            query={legacyQuery}
            field={fieldId}
            fieldOptions={legacyQuery.aggregationFieldOptions(agg)}
            onFieldChange={this.onPickField}
            enableSubDimensions={true}
            preventNumberSubDimensions={true}
          />
        </div>
      );
    }

    return (
      <AggregationItemList
        width={this.props.width}
        maxHeight={this.props.maxHeight}
        alwaysExpanded={this.props.alwaysExpanded}
        sections={sections}
        onChange={this.onPickAggregation}
        itemIsSelected={this.itemIsSelected.bind(this)}
        renderSectionIcon={section => <Icon name={section.icon} size={18} />}
        renderItemExtra={this.renderItemExtra.bind(this)}
        getItemClassName={item =>
          item.metric?.archived ? CS.textMedium : null
        }
        onChangeSection={(section, sectionIndex) => {
          if (section.custom) {
            this.onPickAggregation({ custom: true });
          }
        }}
      />
    );
  }
}
