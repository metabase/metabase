/* eslint-disable react/prop-types */
/* eslint-disable react/no-string-refs */
import { createRef, Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";
import { t } from "ttag";

import cx from "classnames";
import { Icon } from "metabase/core/components/Icon";
import IconBorder from "metabase/components/IconBorder";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import { DatabaseSchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";
import AggregationWidget from "./AggregationWidget";
import BreakoutWidget from "./BreakoutWidget";
import FilterWidgetList from "./filters/FilterWidgetList";
import FilterPopover from "./filters/FilterPopover";

export default class GuiQueryEditor extends Component {
  constructor(props) {
    super(props);

    this.filterPopover = createRef();
    this.guiBuilder = createRef();
  }

  state = {
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

  renderAdd(text, onClick, targetRefName) {
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

  renderAddIcon(targetRefName) {
    return (
      <IconBorder borderRadius="3px" ref={targetRefName}>
        <Icon name="add" />
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
            removeFilter={index => setDatasetQuery(query.removeFilter(index))}
            updateFilter={(index, filter) =>
              setDatasetQuery(query.updateFilter(index, filter))
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
            ref={this.filterPopover}
            triggerElement={addFilterButton}
            triggerClasses="flex align-center"
            horizontalAttachments={["left", "center"]}
            autoWidth
          >
            <FilterPopover
              isNew
              query={query}
              onChangeFilter={filter => setDatasetQuery(query.filter(filter))}
              onClose={() => this.filterPopover.current.close()}
            />
          </PopoverWithTrigger>
        </div>
      </div>
    );
  }

  renderAggregation() {
    const { query, features, setDatasetQuery, supportMultipleAggregations } =
      this.props;

    if (!features.aggregation) {
      return;
    }

    // aggregation clause.  must have table details available
    if (query.isEditable()) {
      const aggregations = query.aggregations();

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
            className="QueryOption p1"
            key={"agg" + index}
            aggregation={aggregation}
            query={query}
            onChangeAggregation={aggregation =>
              aggregation
                ? setDatasetQuery(query.updateAggregation(index, aggregation))
                : setDatasetQuery(query.removeAggregation(index))
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

    const breakouts = query.breakouts();

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
          className="QueryOption p1"
          breakout={breakout}
          query={query}
          breakoutOptions={query.breakoutOptions(breakout)}
          onChangeBreakout={breakout =>
            breakout
              ? setDatasetQuery(query.updateBreakout(index, breakout))
              : setDatasetQuery(query.removeBreakout(index))
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
        ref={this.filterSection}
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
    const guiBuilder = this.guiBuilder.current;
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
        ref={this.guiBuilder}
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
        </div>
      </div>
    );
  }
}
