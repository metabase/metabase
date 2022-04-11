/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import { t, jt } from "ttag";
import DirectionalButton from "metabase/components/DirectionalButton";
import ExpandableString from "metabase/query_builder/components/ExpandableString";
import Icon from "metabase/components/Icon";
import IconBorder from "metabase/components/IconBorder";
import LoadingSpinner from "metabase/components/LoadingSpinner";

import { NotFound } from "metabase/containers/ErrorPages";
import {
  isID,
  isPK,
  foreignKeyCountsByOriginTable,
} from "metabase/lib/schema_metadata";
import { TYPE, isa } from "metabase/lib/types";
import { inflect } from "inflection";
import {
  formatValue,
  formatColumn,
  singularize,
} from "metabase/lib/formatting";

import Tables from "metabase/entities/tables";
import {
  loadObjectDetailFKReferences,
  followForeignKey,
  viewPreviousObjectDetail,
  viewNextObjectDetail,
} from "metabase/query_builder/actions";
import {
  getQuestion,
  getTableMetadata,
  getTableForeignKeys,
  getTableForeignKeyReferences,
  getZoomRow,
  getZoomedObjectId,
  getCanZoomPreviousRow,
  getCanZoomNextRow,
} from "metabase/query_builder/selectors";

import { columnSettings } from "metabase/visualizations/lib/settings/column";

import cx from "classnames";
import _ from "underscore";

const mapStateToProps = state => ({
  question: getQuestion(state),
  table: getTableMetadata(state),
  tableForeignKeys: getTableForeignKeys(state),
  tableForeignKeyReferences: getTableForeignKeyReferences(state),
  zoomedRow: getZoomRow(state),
  zoomedRowID: getZoomedObjectId(state),
  canZoomPreviousRow: getCanZoomPreviousRow(state),
  canZoomNextRow: getCanZoomNextRow(state),
});

// ugh, using function form of mapDispatchToProps here due to circlular dependency with actions
const mapDispatchToProps = dispatch => ({
  fetchTableFks: id => dispatch(Tables.objectActions.fetchForeignKeys({ id })),
  loadObjectDetailFKReferences: (...args) =>
    dispatch(loadObjectDetailFKReferences(...args)),
  followForeignKey: (...args) => dispatch(followForeignKey(...args)),
  viewPreviousObjectDetail: (...args) =>
    dispatch(viewPreviousObjectDetail(...args)),
  viewNextObjectDetail: (...args) => dispatch(viewNextObjectDetail(...args)),
});

export class ObjectDetail extends Component {
  static uiName = t`Object Detail`;
  static identifier = "object";
  static iconName = "document";
  static noun = t`object`;

  static hidden = true;

  static settings = {
    ...columnSettings({ hidden: true }),
  };

  state = {
    hasNotFoundError: false,
  };

  componentDidMount() {
    const { data, table, zoomedRow, zoomedRowID } = this.props;
    const notFoundObject = zoomedRowID != null && !zoomedRow;
    if (data && notFoundObject) {
      this.setState({ hasNotFoundError: true });
      return;
    }

    if (table && table.fks == null) {
      this.props.fetchTableFks(table.id);
    }
    // load up FK references
    if (this.props.tableForeignKeys) {
      this.props.loadObjectDetailFKReferences();
    }
    window.addEventListener("keydown", this.onKeyDown, true);
  }

  componentDidUpdate(prevProps) {
    const { data: prevData } = prevProps;
    const { data, zoomedRow, zoomedRowID } = this.props;
    const queryCompleted = !prevData && data;
    const notFoundObject = zoomedRowID != null && !zoomedRow;
    if (queryCompleted && notFoundObject) {
      this.setState({ hasNotFoundError: true });
    }
  }

  componentWillUnmount() {
    window.removeEventListener("keydown", this.onKeyDown, true);
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    // if the card changed or table metadata loaded then reload fk references
    const tableFKsJustLoaded =
      nextProps.tableForeignKeys && !this.props.tableForeignKeys;
    if (this.props.data !== nextProps.data || tableFKsJustLoaded) {
      this.props.loadObjectDetailFKReferences();
    }
  }

  getIdValue() {
    const { data, zoomedRowID } = this.props;
    if (!data) {
      return null;
    }
    if (zoomedRowID) {
      return zoomedRowID;
    }

    const { cols, rows } = data;
    const columnIndex = _.findIndex(cols, col => isPK(col));
    return rows[0][columnIndex];
  }

  foreignKeyClicked = fk => {
    this.props.followForeignKey(fk);
  };

  cellRenderer(column, value, isColumn) {
    const {
      settings,
      onVisualizationClick,
      visualizationIsClickable,
    } = this.props;

    let cellValue;
    let clicked;
    let isLink;

    if (isColumn) {
      cellValue = column !== null ? formatColumn(column) : null;
      clicked = {
        column,
      };
      isLink = false;
    } else {
      if (value === null || value === undefined || value === "") {
        cellValue = <span className="text-light">{t`Empty`}</span>;
      } else if (isa(column.semantic_type, TYPE.SerializedJSON)) {
        let formattedJson;
        try {
          formattedJson = JSON.stringify(JSON.parse(value), null, 2);
        } catch (e) {
          formattedJson = value;
        }
        cellValue = <pre className="ObjectJSON">{formattedJson}</pre>;
      } else if (typeof value === "object") {
        const formattedJson = JSON.stringify(value, null, 2);
        cellValue = <pre className="ObjectJSON">{formattedJson}</pre>;
      } else {
        cellValue = formatValue(value, {
          ...settings.column(column),
          jsx: true,
          rich: true,
        });
        if (typeof cellValue === "string") {
          cellValue = <ExpandableString str={cellValue} length={140} />;
        }
      }
      clicked = {
        column,
        value,
      };
      isLink = isID(column);
    }

    const isClickable =
      onVisualizationClick && visualizationIsClickable(clicked);

    return (
      <div>
        <span
          className={cx({
            "cursor-pointer": isClickable,
            link: isClickable && isLink,
          })}
          onClick={
            isClickable &&
            (e => {
              onVisualizationClick({ ...clicked, element: e.currentTarget });
            })
          }
        >
          {cellValue}
        </span>
      </div>
    );
  }

  renderDetailsTable() {
    const {
      zoomedRow,
      data: { rows, cols },
    } = this.props;
    const row = zoomedRow || rows[0];
    return cols.map((column, columnIndex) => (
      <div className="Grid Grid--1of2 mb2" key={columnIndex}>
        <div className="Grid-cell">
          {this.cellRenderer(column, row[columnIndex], true)}
        </div>
        <div
          style={{ wordWrap: "break-word" }}
          className="Grid-cell text-bold text-dark"
        >
          {this.cellRenderer(column, row[columnIndex], false)}
        </div>
      </div>
    ));
  }

  renderRelationships() {
    const { tableForeignKeys, tableForeignKeyReferences } = this.props;
    if (!tableForeignKeys) {
      return null;
    }

    if (tableForeignKeys.length < 1) {
      return <p className="my4 text-centered">{t`No relationships found.`}</p>;
    }

    const fkCountsByTable = foreignKeyCountsByOriginTable(tableForeignKeys);

    const relationships = tableForeignKeys
      .sort((a, b) =>
        a.origin.table.display_name.localeCompare(b.origin.table.display_name),
      )
      .map(fk => {
        let fkCount = <LoadingSpinner size={25} />;
        let fkCountValue = 0;
        let fkClickable = false;
        if (tableForeignKeyReferences) {
          const fkCountInfo = tableForeignKeyReferences[fk.origin.id];
          if (fkCountInfo && fkCountInfo.status === 1) {
            fkCount = <span>{fkCountInfo.value}</span>;

            if (fkCountInfo.value) {
              fkCountValue = fkCountInfo.value;
              fkClickable = true;
            }
          }
        }
        const chevron = (
          <IconBorder className="flex-align-right">
            <Icon name="chevronright" size={10} />
          </IconBorder>
        );

        const relationName = inflect(
          fk.origin.table.display_name,
          fkCountValue,
        );
        const via =
          fkCountsByTable[fk.origin.table.id] > 1 ? (
            <span className="text-medium text-normal">
              {" "}
              {t`via ${fk.origin.display_name}`}
            </span>
          ) : null;

        const info = (
          <div>
            <h2>{fkCount}</h2>
            <h5 className="block">
              {relationName}
              {via}
            </h5>
          </div>
        );
        let fkReference;
        const referenceClasses = cx("flex align-center my2 pb2 border-bottom", {
          "text-brand-hover cursor-pointer text-dark": fkClickable,
          "text-medium": !fkClickable,
        });

        if (fkClickable) {
          fkReference = (
            <div
              className={referenceClasses}
              key={fk.id}
              onClick={this.foreignKeyClicked.bind(null, fk)}
            >
              {info}
              {chevron}
            </div>
          );
        } else {
          fkReference = (
            <div className={referenceClasses} key={fk.id}>
              {info}
            </div>
          );
        }

        return <li key={fk.id}>{fkReference}</li>;
      });

    return <ul className="px4">{relationships}</ul>;
  }

  onKeyDown = event => {
    if (event.key === "ArrowLeft") {
      this.props.viewPreviousObjectDetail();
    }
    if (event.key === "ArrowRight") {
      this.props.viewNextObjectDetail();
    }
  };

  getObjectName = () => {
    const { question, table } = this.props;
    const tableObjectName = table && table.objectName();
    if (tableObjectName) {
      return tableObjectName;
    }
    const questionName = question && question.displayName();
    if (questionName) {
      return singularize(questionName);
    }
    return t`Unknown`;
  };

  render() {
    const { data, zoomedRow, canZoomPreviousRow, canZoomNextRow } = this.props;
    if (!data) {
      return false;
    }
    if (this.state.hasNotFoundError) {
      return <NotFound />;
    }

    const canZoom = !!zoomedRow;
    const objectName = this.getObjectName();

    return (
      <div className="scroll-y pt2 px4">
        <div className="ObjectDetail bordered rounded">
          <div className="Grid border-bottom relative">
            <div className="Grid-cell border-right px4 py3 ml2 arrow-right">
              <div className="text-brand text-bold">
                <span>{objectName}</span>
                <h1>{this.getIdValue()}</h1>
              </div>
            </div>
            <div className="Grid-cell flex align-center Cell--1of3 bg-alt">
              <div className="p4 flex align-center text-bold text-medium">
                <Icon name="connections" size={17} />
                <div className="ml2">
                  {jt`This ${(
                    <span className="text-dark">{objectName}</span>
                  )} is connected to:`}
                </div>
              </div>
            </div>

            {canZoom && (
              <div
                className={cx(
                  "absolute left cursor-pointer text-brand-hover lg-ml2",
                  { disabled: !canZoomPreviousRow },
                )}
                aria-disabled={!canZoomPreviousRow}
                style={{
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                }}
                data-testid="view-previous-object-detail"
              >
                <DirectionalButton
                  direction="left"
                  onClick={this.props.viewPreviousObjectDetail}
                />
              </div>
            )}
            {canZoom && (
              <div
                className={cx(
                  "absolute right cursor-pointer text-brand-hover lg-ml2",
                  { disabled: !canZoomNextRow },
                )}
                aria-disabled={!canZoomNextRow}
                style={{
                  top: "50%",
                  transform: "translate(50%, -50%)",
                }}
                data-testid="view-next-object-detail"
              >
                <DirectionalButton
                  direction="right"
                  onClick={this.props.viewNextObjectDetail}
                />
              </div>
            )}
          </div>
          <div className="Grid">
            <div
              className="Grid-cell p4"
              style={{ marginLeft: "2.4rem", fontSize: "1rem" }}
            >
              {this.renderDetailsTable()}
            </div>
            <div className="Grid-cell Cell--1of3 bg-alt">
              {this.renderRelationships()}
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(ObjectDetail);
