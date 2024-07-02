/* eslint-disable react/prop-types */
/* eslint-disable react/no-string-refs */
import cx from "classnames";
import PropTypes from "prop-types";
import { Component, createRef } from "react";
import ReactDOM from "react-dom";
import { t } from "ttag";

import IconBorder from "metabase/components/IconBorder";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import CS from "metabase/css/core/index.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";
import { DatabaseSchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";
import { Icon } from "metabase/ui";
import * as Lib from "metabase-lib";

import { FilterPopover } from "../FilterPopover";
import { FilterWidgetList } from "../FilterWidgetList";

import GuiQueryEditorS from "./GuiQueryEditor.module.css";

/**
 * @deprecated use MLv2
 */
export class GuiQueryEditor extends Component {
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
  };

  static defaultProps = {
    features: {
      filter: true,
      breakout: true,
      sort: true,
      limit: true,
    },
  };

  renderAdd(text, onClick, targetRefName) {
    const className = cx(
      CS.textLight,
      CS.textBold,
      CS.flex,
      CS.alignCenter,
      CS.textMediumHover,
      CS.cursorPointer,
      CS.noDecoration,
      CS.transitionColor,
    );
    if (onClick) {
      return (
        <a className={className} onClick={onClick}>
          {text && <span className={CS.mr1}>{text}</span>}
          {this.renderAddIcon(targetRefName)}
        </a>
      );
    } else {
      return (
        <span className={className}>
          {text && <span className={CS.mr1}>{text}</span>}
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
    const { legacyQuery, query, features, setDatasetQuery } = this.props;

    if (!features.filter) {
      return;
    }

    let enabled;
    let filterList;
    let addFilterButton;

    const { isEditable } = Lib.queryDisplayInfo(query);

    if (isEditable) {
      enabled = true;

      const filters = legacyQuery.filters();
      if (filters && filters.length > 0) {
        filterList = (
          <FilterWidgetList
            query={legacyQuery}
            filters={filters}
            removeFilter={index =>
              setDatasetQuery(legacyQuery.removeFilter(index))
            }
            updateFilter={(index, filter) =>
              setDatasetQuery(legacyQuery.updateFilter(index, filter))
            }
          />
        );
      }

      if (legacyQuery.canAddFilter()) {
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
      <div
        className={cx(QueryBuilderS.QuerySection, { [CS.disabled]: !enabled })}
      >
        <div className={QueryBuilderS.QueryFilters}>{filterList}</div>
        <div className={CS.mx2}>
          <PopoverWithTrigger
            id="FilterPopover"
            ref={this.filterPopover}
            triggerElement={addFilterButton}
            triggerClasses={cx(CS.flex, CS.alignCenter)}
            horizontalAttachments={["left", "center"]}
            autoWidth
          >
            <FilterPopover
              isNew
              query={legacyQuery}
              onChangeFilter={filter =>
                setDatasetQuery(legacyQuery.filter(filter))
              }
              onClose={() => this.filterPopover.current.close()}
            />
          </PopoverWithTrigger>
        </div>
      </div>
    );
  }

  renderDataSection() {
    const { legacyQuery, query, setDatasetQuery } = this.props;

    return (
      <div
        className={cx(
          QueryBuilderS.GuiBuilderSection,
          QueryBuilderS.GuiBuilderData,
          CS.flex,
          CS.alignCenter,
          GuiQueryEditorS.arrowRight,
        )}
        data-testid="gui-builder-data"
      >
        <span
          className={cx(
            QueryBuilderS.GuiBuilderSectionLabel,
            QueryBuilderS.QueryLabel,
          )}
        >{t`Data`}</span>
        {this.props.canChangeTable ? (
          <DatabaseSchemaAndTableDataSelector
            selectedTableId={Lib.sourceTableOrCardId(query)}
            setSourceTableFn={tableId =>
              setDatasetQuery(
                legacyQuery.setSourceTableId(tableId).datasetQuery(),
              )
            }
          />
        ) : (
          <span
            className={cx(CS.flex, CS.alignCenter, CS.px2, CS.py2, CS.textBold)}
          >
            {legacyQuery.table() && legacyQuery.table().displayName()}
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
        className={cx(
          QueryBuilderS.GuiBuilderFilteredBy,
          QueryBuilderS.GuiBuilderSection,
          CS.flex,
          CS.alignCenter,
        )}
        ref={this.filterSection}
      >
        <span
          className={cx(
            QueryBuilderS.GuiBuilderSectionLabel,
            QueryBuilderS.QueryLabel,
          )}
        >{t`Filtered by`}</span>
        {this.renderFilters()}
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
        className={cx(QueryBuilderS.GuiBuilder, CS.rounded, CS.shadowed, {
          [QueryBuilderS.GuiBuilderExpand]: this.state.expanded,
        })}
        data-testid="gui-builder"
        ref={this.guiBuilder}
      >
        <div className={cx(QueryBuilderS.GuiBuilderRow, CS.flex)}>
          {this.renderDataSection()}
          {this.renderFilterSection()}
        </div>
        <div className={cx(QueryBuilderS.GuiBuilderRow, CS.flex, CS.flexFull)}>
          <div className={CS.flexFull} />
          {this.props.children}
        </div>
      </div>
    );
  }
}
