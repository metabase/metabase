/* @flow */

import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";
import { t } from "c-3po";
import AggregationWidget_LEGACY from "./AggregationWidget.jsx";
import BreakoutWidget_LEGACY from "./BreakoutWidget.jsx";
import ExtendedOptions from "./ExtendedOptions.jsx";
import FilterWidgetList from "./filters/FilterWidgetList.jsx";
import FilterPopover from "./filters/FilterPopover.jsx";
import Icon from "metabase/components/Icon.jsx";
import IconBorder from "metabase/components/IconBorder.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import { DatabaseSchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";

import cx from "classnames";
import _ from "underscore";

import type { TableId } from "metabase/meta/types/Table";
import type { DatabaseId } from "metabase/meta/types/Database";
import type { DatasetQuery } from "metabase/meta/types/Card";
import type {
  TableMetadata,
  DatabaseMetadata,
} from "metabase/meta/types/Metadata";
import type { Children } from "react";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

export type GuiQueryEditorFeatures = {
  data?: boolean,
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

  databases: DatabaseMetadata[],
  tables: TableMetadata[],

  supportMultipleAggregations?: boolean,

  setDatabaseFn: (id: DatabaseId) => void,
  setSourceTableFn: (id: TableId) => void,
  setDatasetQuery: (datasetQuery: DatasetQuery) => void,

  isShowingTutorial: boolean,
  isShowingDataReference: boolean,
};

type State = {
  expanded: boolean,
};

export default class GuiQueryEditor extends Component {
  props: Props;
  state: State = {
    expanded: true,
  };

  static propTypes = {
    databases: PropTypes.array,
    isShowingDataReference: PropTypes.bool.isRequired,
    setDatasetQuery: PropTypes.func.isRequired,
    setDatabaseFn: PropTypes.func,
    setSourceTableFn: PropTypes.func,
    features: PropTypes.object,
    supportMultipleAggregations: PropTypes.bool,
  };

  static defaultProps = {
    features: {
      data: true,
      filter: true,
      aggregation: true,
      breakout: true,
      sort: true,
      limit: true,
    },
    supportMultipleAggregations: true,
  };

  renderAdd(text: ?string, onClick: ?() => void, targetRefName?: string) {
    let className =
      "AddButton text-grey-2 text-bold flex align-center text-grey-4-hover cursor-pointer no-decoration transition-color";
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

      let filters = query.filters();
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
              onCommitFilter={filter =>
                query.addFilter(filter).update(setDatasetQuery)
              }
              onClose={() => this.refs.filterPopover.close()}
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
      let aggregations: (Aggregation | null)[] = query.aggregations();

      if (aggregations.length === 0) {
        // add implicit rows aggregation
        aggregations.push(["rows"]);
      }

      // Placeholder aggregation for showing the add button
      if (supportMultipleAggregations && !query.isBareRows()) {
        aggregations.push([]);
      }

      let aggregationList = [];
      for (const [index, aggregation] of aggregations.entries()) {
        aggregationList.push(
          <AggregationWidget
            key={"agg" + index}
            index={index}
            aggregation={aggregation}
            query={query}
            updateQuery={setDatasetQuery}
            addButton={this.renderAdd(null)}
          />,
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

    for (let i = 0; i < breakouts.length; i++) {
      const breakout = breakouts[i];

      if (breakout == null) {
        breakoutList.push(<span key="nullBreakout" className="ml1" />);
      }

      breakoutList.push(
        <BreakoutWidget
          key={"breakout" + i}
          className="View-section-breakout SelectionModule p1"
          index={i}
          breakout={breakout}
          query={query}
          updateQuery={setDatasetQuery}
          addButton={this.renderAdd(i === 0 ? t`Add a grouping` : null)}
        />,
      );

      if (breakouts[i + 1] != null) {
        breakoutList.push(
          <span key={"and" + i} className="text-bold">{t`and`}</span>,
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
    const { databases, query, isShowingTutorial } = this.props;
    const tableMetadata = query.tableMetadata();
    const datasetQuery = query.datasetQuery();
    const databaseId = datasetQuery && datasetQuery.database;
    const sourceTableId =
      datasetQuery && datasetQuery.query && datasetQuery.query.source_table;
    const isInitiallyOpen =
      (!datasetQuery.database || !sourceTableId) && !isShowingTutorial;

    return (
      <div
        className={
          "GuiBuilder-section GuiBuilder-data flex align-center arrow-right"
        }
      >
        <span className="GuiBuilder-section-label Query-label">{t`Data`}</span>
        {this.props.features.data ? (
          <DatabaseSchemaAndTableDataSelector
            databases={databases}
            selected={sourceTableId}
            selectedDatabaseId={databaseId}
            selectedTableId={sourceTableId}
            setDatabaseFn={this.props.setDatabaseFn}
            setSourceTableFn={this.props.setSourceTableFn}
            isInitiallyOpen={isInitiallyOpen}
          />
        ) : (
          <span className="flex align-center px2 py2 text-bold text-grey">
            {tableMetadata && tableMetadata.display_name}
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
    let contentWidth =
      ["data", "filter", "view", "groupedBy", "sortLimit"].reduce(
        (acc, ref) => {
          let node = ReactDOM.findDOMNode(this.refs[`${ref}Section`]);
          return acc + (node ? node.offsetWidth : 0);
        },
        0,
      ) + 5;
    let guiBuilderWidth = guiBuilder.offsetWidth;

    let expanded = contentWidth < guiBuilderWidth;
    if (this.state.expanded !== expanded) {
      this.setState({ expanded });
    }
  }

  render() {
    const { databases, query } = this.props;
    const datasetQuery = query.datasetQuery();
    const readOnly =
      datasetQuery.database != null &&
      !_.findWhere(databases, { id: datasetQuery.database });
    if (readOnly) {
      return <div className="border-bottom border-med" />;
    }

    return (
      <div
        className={cx("GuiBuilder rounded shadowed", {
          "GuiBuilder--expand": this.state.expanded,
          disabled: readOnly,
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

export const AggregationWidget = ({
  index,
  aggregation,
  query,
  updateQuery,
  addButton,
}: Object) => (
  <AggregationWidget_LEGACY
    query={query}
    aggregation={aggregation}
    tableMetadata={query.tableMetadata()}
    customFields={query.expressions()}
    updateAggregation={aggregation =>
      query.updateAggregation(index, aggregation).update(updateQuery)
    }
    removeAggregation={
      query.canRemoveAggregation()
        ? () => query.removeAggregation(index).update(updateQuery)
        : null
    }
    addButton={addButton}
  />
);

export const BreakoutWidget = ({
  className,
  index,
  breakout,
  query,
  updateQuery,
  addButton,
}: Object) => (
  <BreakoutWidget_LEGACY
    className={className}
    field={breakout}
    fieldOptions={query.breakoutOptions(breakout)}
    customFieldOptions={query.expressions()}
    tableMetadata={query.tableMetadata()}
    setField={field => query.updateBreakout(index, field).update(updateQuery)}
    addButton={addButton}
  />
);
