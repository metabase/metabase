/* @flow */

import React from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";
import { t } from "ttag";

import AggregationWidget from "./AggregationWidget";
import BreakoutWidget from "./BreakoutWidget";
import ExtendedOptions from "./ExtendedOptions";
import FilterWidgetList from "./filters/FilterWidgetList";
import FilterPopover from "./filters/FilterPopover";
import Icon from "metabase/components/Icon";
import IconBorder from "metabase/components/IconBorder";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import { DatabaseSchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";

import cx from "classnames";

import type { DatasetQuery } from "metabase-types/types/Card";
import type { Children } from "react";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

export type GuiQueryEditorFeatures = {
  filter?: boolean,
  aggregation?: boolean,
  breakout?: boolean,
  sort?: boolean,
  limit?: boolean,
};

type Props = {
  children?: Children,

  features: GuiQueryEditorFeatures,

  query: StructuredQuery,

  supportMultipleAggregations?: boolean,

  setDatasetQuery: (datasetQuery: DatasetQuery) => void,

  isShowingDataReference?: boolean,
};

type State = {
  expanded: boolean,
};

export default class GuiQueryEditor extends React.Component {
  props: Props;
  state: State = {
    expanded: true,
  };

  static propTypes = {
    isShowingDataReference: PropTypes.bool.isRequired,
    setDatasetQuery: PropTypes.func.isRequired,
    features: PropTypes.object,
    supportMultipleAggregations: PropTypes.bool,
  };

  static defaultProps = {
    features: {
      filter: true,
      aggregation: true,
      breakout: true,
      sort: true,
      limit: true,
    },
    supportMultipleAggregations: true,
  };

  renderAdd(text: ?string, onClick: ?() => void, targetRefName?: string) {
    const className =
      "AddButton text-light text-bold flex align-center text-medium-hover cursor-pointer no-decoration transition-color";
    if (onClick) {
      return (
        <a className={className} onClick={onClick}>
          {text && <span className="mr1">{text}</span>}
          {this.renderAddIcon(targetRefName)}
        </a>
      );
    } else {
      return (
        <span className={className}>
          {text && <span className="mr1">{text}</span>}
          {this.renderAddIcon(targetRefName)}
        </span>
      );
    }
  }

  renderAddIcon(targetRefName?: string) {
    return (
      <IconBorder borderRadius="3px" ref={targetRefName}>
        <Icon name="add" size={14} />
      </IconBorder>
    );
  }

  renderFilters() {
    const { query, features, setDatasetQuery } = this.props;

    if (!features.filter) {
      return;
    }

    let enabled;
    let filterList;
    let addFilterButton;

    if (query.isEditable()) {
      enabled = true;

      const filters = query.filters();
      if (filters && filters.length > 0) {
        filterList = (
          <FilterWidgetList
            query={query}
            filters={filters}
            removeFilter={index =>
              query.removeFilter(index).update(setDatasetQuery)
            }
            updateFilter={(index, filter) =>
              query.updateFilter(index, filter).update(setDatasetQuery)
            }
          />
        );
      }

      if (query.canAddFilter()) {
        addFilterButton = this.renderAdd(
          filterList ? null : t`Add filters to narrow your answer`,
          null,
          "addFilterTarget",
        );
      }
    } else {
      enabled = false;
      addFilterButton = this.renderAdd(
        t`Add filters to narrow your answer`,
        null,
        "addFilterTarget",
      );
    }

    return (
      <div className={cx("Query-section", { disabled: !enabled })}>
        <div className="Query-filters">{filterList}</div>
        <div className="mx2">
          <PopoverWithTrigger
            id="FilterPopover"
            ref="filterPopover"
            triggerElement={addFilterButton}
            triggerClasses="flex align-center"
            getTarget={() => this.refs.addFilterTarget}
            horizontalAttachments={["left", "center"]}
            autoWidth
          >
            <FilterPopover
              isNew
              query={query}
              onChangeFilter={filter =>
                query.filter(filter).update(setDatasetQuery)
              }
              onClose={() => this.refs.filterPopover.close()}
              showCustom={false}
            />
          </PopoverWithTrigger>
        </div>
      </div>
    );
  }

  renderAggregation() {
    const {
      query,
      features,
      setDatasetQuery,
      supportMultipleAggregations,
    } = this.props;

    if (!features.aggregation) {
      return;
    }

    // aggregation clause.  must have table details available
    if (query.isEditable()) {
      // $FlowFixMe
      const aggregations: (Aggregation | null)[] = query.aggregations();

      if (aggregations.length === 0) {
        // add implicit rows aggregation
        aggregations.push(["rows"]);
      }

      // Placeholder aggregation for showing the add button
      if (supportMultipleAggregations && !query.isBareRows()) {
        aggregations.push(null);
      }

      const aggregationList = [];
      for (const [index, aggregation] of aggregations.entries()) {
        aggregationList.push(
          <AggregationWidget
            className="View-section-aggregation QueryOption p1"
            key={"agg" + index}
            aggregation={aggregation}
            query={query}
            onChangeAggregation={aggregation =>
              aggregation
                ? query
                    .updateAggregation(index, aggregation)
                    .update(setDatasetQuery)
                : query.removeAggregation(index).update(setDatasetQuery)
            }
            showMetrics={false}
            showRawData
          >
            {this.renderAdd(null)}
          </AggregationWidget>,
        );
        if (
          aggregations[index + 1] != null &&
          aggregations[index + 1].length > 0
        ) {
          aggregationList.push(
            <span key={"and" + index} className="text-bold">{t`and`}</span>,
          );
        }
      }
      return aggregationList;
    } else {
      // TODO: move this into AggregationWidget?
      return (
        <div className="Query-section Query-section-aggregation disabled">
          <a className="QueryOption p1 flex align-center">{t`Raw data`}</a>
        </div>
      );
    }
  }

  renderBreakouts() {
    const { query, setDatasetQuery, features } = this.props;

    if (!features.breakout) {
      return;
    }

    const breakoutList = [];

    // $FlowFixMe
    const breakouts: (Breakout | null)[] = query.breakouts();

    // Placeholder breakout for showing the add button
    if (query.canAddBreakout()) {
      breakouts.push(null);
    }

    for (let index = 0; index < breakouts.length; index++) {
      const breakout = breakouts[index];

      if (breakout == null) {
        breakoutList.push(<span key="nullBreakout" className="ml1" />);
      }

      breakoutList.push(
        <BreakoutWidget
          key={"breakout" + (breakout ? index : "-new")}
          className="View-section-breakout QueryOption p1"
          breakout={breakout}
          query={query}
          breakoutOptions={query.breakoutOptions(breakout)}
          onChangeBreakout={breakout =>
            breakout
              ? query.updateBreakout(index, breakout).update(setDatasetQuery)
              : query.removeBreakout(index).update(setDatasetQuery)
          }
        >
          {this.renderAdd(index === 0 ? t`Add a grouping` : null)}
        </BreakoutWidget>,
      );

      if (breakouts[index + 1] != null) {
        breakoutList.push(
          <span key={"and" + index} className="text-bold">{t`and`}</span>,
        );
      }
    }

    return (
      <div
        className={cx("Query-section Query-section-breakout", {
          disabled: breakoutList.length === 0,
        })}
      >
        {breakoutList}
      </div>
    );
  }

  renderDataSection() {
    const { query, setDatasetQuery } = this.props;

    return (
      <div
        className={
          "GuiBuilder-section GuiBuilder-data flex align-center arrow-right"
        }
      >
        <span className="GuiBuilder-section-label Query-label">{t`Data`}</span>
        {this.props.canChangeTable ? (
          <DatabaseSchemaAndTableDataSelector
            selectedTableId={query.tableId()}
            setSourceTableFn={tableId =>
              setDatasetQuery(query.setSourceTableId(tableId).datasetQuery())
            }
          />
        ) : (
          <span className="flex align-center px2 py2 text-bold text-grey">
            {query.table() && query.table().displayName()}
          </span>
        )}
      </div>
    );
  }

  renderFilterSection() {
    if (!this.props.features.filter) {
      return;
    }

    return (
      <div
        className="GuiBuilder-section GuiBuilder-filtered-by flex align-center"
        ref="filterSection"
      >
        <span className="GuiBuilder-section-label Query-label">{t`Filtered by`}</span>
        {this.renderFilters()}
      </div>
    );
  }

  renderViewSection() {
    const { features } = this.props;
    if (!features.aggregation && !features.breakout) {
      return;
    }

    return (
      <div
        className="GuiBuilder-section GuiBuilder-view flex align-center px1 pr2"
        ref="viewSection"
      >
        <span className="GuiBuilder-section-label Query-label">{t`View`}</span>
        {this.renderAggregation()}
      </div>
    );
  }

  renderGroupedBySection() {
    const { features } = this.props;
    if (!features.aggregation && !features.breakout) {
      return;
    }

    return (
      <div
        className="GuiBuilder-section GuiBuilder-groupedBy flex align-center px1"
        ref="viewSection"
      >
        <span className="GuiBuilder-section-label Query-label">{t`Grouped By`}</span>
        {this.renderBreakouts()}
      </div>
    );
  }

  componentDidUpdate() {
    const guiBuilder = ReactDOM.findDOMNode(this.refs.guiBuilder);
    if (!guiBuilder) {
      return;
    }

    // HACK: magic number "5" accounts for the borders between the sections?
    const contentWidth =
      ["data", "filter", "view", "groupedBy", "sortLimit"].reduce(
        (acc, ref) => {
          const node = ReactDOM.findDOMNode(this.refs[`${ref}Section`]);
          return acc + (node ? node.offsetWidth : 0);
        },
        0,
      ) + 5;
    const guiBuilderWidth = guiBuilder.offsetWidth;

    const expanded = contentWidth < guiBuilderWidth;
    if (this.state.expanded !== expanded) {
      this.setState({ expanded });
    }
  }

  render() {
    return (
      <div
        className={cx("GuiBuilder rounded shadowed", {
          "GuiBuilder--expand": this.state.expanded,
        })}
        ref="guiBuilder"
      >
        <div className="GuiBuilder-row flex">
          {this.renderDataSection()}
          {this.renderFilterSection()}
        </div>
        <div className="GuiBuilder-row flex flex-full">
          {this.renderViewSection()}
          {this.renderGroupedBySection()}
          <div className="flex-full" />
          {this.props.children}
          <ExtendedOptions {...this.props} />
        </div>
      </div>
    );
  }
}
