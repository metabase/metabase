/* @flow weak */

import React, { Component } from "react";
import { connect } from "react-redux";
import { t, jt } from "ttag";
import DirectionalButton from "metabase/components/DirectionalButton";
import ExpandableString from "metabase/query_builder/components/ExpandableString";
import Icon from "metabase/components/Icon";
import IconBorder from "metabase/components/IconBorder";
import LoadingSpinner from "metabase/components/LoadingSpinner";

import {
  isID,
  isPK,
  foreignKeyCountsByOriginTable,
} from "metabase/lib/schema_metadata";
import { TYPE, isa } from "metabase/lib/types";
import { inflect } from "inflection";
import { formatValue, formatColumn } from "metabase/lib/formatting";

import Tables from "metabase/entities/tables";
import {
  loadObjectDetailFKReferences,
  followForeignKey,
  viewPreviousObjectDetail,
  viewNextObjectDetail,
} from "metabase/query_builder/actions";
import {
  getTableMetadata,
  getTableForeignKeys,
  getTableForeignKeyReferences,
} from "metabase/query_builder/selectors";

import { columnSettings } from "metabase/visualizations/lib/settings/column";

import cx from "classnames";
import _ from "underscore";

import type { VisualizationProps } from "metabase-types/types/Visualization";
import type { FieldId, Field } from "metabase-types/types/Field";
import type Table from "metabase-lib/lib/metadata/Table";

type ForeignKeyId = number;
type ForeignKey = {
  id: ForeignKeyId,
  relationship: string,
  origin: Field,
  origin_id: FieldId,
  destination: Field,
  destination_id: FieldId,
};

type ForeignKeyCountInfo = {
  status: number,
  value: number,
};

type Props = VisualizationProps & {
  table: ?Table,
  tableForeignKeys: ?(ForeignKey[]),
  tableForeignKeyReferences: { [id: ForeignKeyId]: ForeignKeyCountInfo },
  fetchTableFks: () => void,
  loadObjectDetailFKReferences: () => void,
  fetchTableFks: (id: any) => void,
  followForeignKey: (fk: any) => void,
  viewNextObjectDetail: () => void,
  viewPreviousObjectDetail: () => void,
};

const mapStateToProps = state => ({
  table: getTableMetadata(state),
  tableForeignKeys: getTableForeignKeys(state),
  tableForeignKeyReferences: getTableForeignKeyReferences(state),
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
  props: Props;

  static uiName = t`Object Detail`;
  static identifier = "object";
  static iconName = "document";
  static noun = t`object`;

  static hidden = true;

  static settings = {
    ...columnSettings({ hidden: true }),
  };

  componentDidMount() {
    const { table } = this.props;
    if (table && table.fks == null) {
      this.props.fetchTableFks(table.id);
    }
    // load up FK references
    if (this.props.tableForeignKeys) {
      this.props.loadObjectDetailFKReferences();
    }
    window.addEventListener("keydown", this.onKeyDown, true);
  }

  componentWillUnmount() {
    window.removeEventListener("keydown", this.onKeyDown, true);
  }

  componentWillReceiveProps(nextProps) {
    // if the card changed or table metadata loaded then reload fk references
    const tableFKsJustLoaded =
      nextProps.tableForeignKeys && !this.props.tableForeignKeys;
    if (this.props.data !== nextProps.data || tableFKsJustLoaded) {
      this.props.loadObjectDetailFKReferences();
    }
  }

  getIdValue() {
    if (!this.props.data) {
      return null;
    }

    const {
      data: { cols, rows },
    } = this.props;
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
      } else if (isa(column.special_type, TYPE.SerializedJSON)) {
        const formattedJson = JSON.stringify(JSON.parse(value), null, 2);
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
      data: { cols, rows },
    } = this.props;
    return cols.map((column, columnIndex) => (
      <div className="Grid Grid--1of2 mb2" key={columnIndex}>
        <div className="Grid-cell">
          {this.cellRenderer(column, rows[0][columnIndex], true)}
        </div>
        <div
          style={{ wordWrap: "break-word" }}
          className="Grid-cell text-bold text-dark"
        >
          {this.cellRenderer(column, rows[0][columnIndex], false)}
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

        return <li>{fkReference}</li>;
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

  render() {
    const { data, table } = this.props;
    if (!data) {
      return false;
    }

    const tableName = table ? table.objectName() : t`Unknown`;
    // TODO: once we nail down the "title" column of each table this should be something other than the id
    const idValue = this.getIdValue();

    return (
      <div className="scroll-y pt2 px4">
        <div className="ObjectDetail bordered rounded">
          <div className="Grid border-bottom relative">
            <div className="Grid-cell border-right px4 py3 ml2 arrow-right">
              <div className="text-brand text-bold">
                <span>{tableName}</span>
                <h1>{idValue}</h1>
              </div>
            </div>
            <div className="Grid-cell flex align-center Cell--1of3 bg-alt">
              <div className="p4 flex align-center text-bold text-medium">
                <Icon name="connections" size={17} />
                <div className="ml2">
                  {jt`This ${(
                    <span className="text-dark">{tableName}</span>
                  )} is connected to:`}
                </div>
              </div>
            </div>

            <div
              className={cx(
                "absolute left cursor-pointer text-brand-hover lg-ml2",
                { disabled: idValue <= 1 },
              )}
              style={{
                top: "50%",
                transform: "translate(-50%, -50%)",
              }}
            >
              <DirectionalButton
                direction="left"
                onClick={this.props.viewPreviousObjectDetail}
              />
            </div>
            <div
              className="absolute right cursor-pointer text-brand-hover lg-ml2"
              style={{
                top: "50%",
                transform: "translate(50%, -50%)",
              }}
            >
              <DirectionalButton
                direction="right"
                onClick={this.props.viewNextObjectDetail}
              />
            </div>
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

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(ObjectDetail);
