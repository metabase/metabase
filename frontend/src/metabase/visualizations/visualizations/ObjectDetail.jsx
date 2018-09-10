/* @flow weak */

import React, { Component } from "react";
import { connect } from "react-redux";
import { t, jt } from "c-3po";
import DirectionalButton from "metabase/components/DirectionalButton";
import ExpandableString from "metabase/query_builder/components/ExpandableString.jsx";
import Icon from "metabase/components/Icon.jsx";
import IconBorder from "metabase/components/IconBorder.jsx";
import LoadingSpinner from "metabase/components/LoadingSpinner.jsx";

import {
  isID,
  isPK,
  foreignKeyCountsByOriginTable,
} from "metabase/lib/schema_metadata";
import { TYPE, isa } from "metabase/lib/types";
import { singularize, inflect } from "inflection";
import { formatValue, formatColumn } from "metabase/lib/formatting";
import { isQueryable } from "metabase/lib/table";

import {
  viewPreviousObjectDetail,
  viewNextObjectDetail,
} from "metabase/query_builder/actions";

import cx from "classnames";
import _ from "underscore";

import type { VisualizationProps } from "metabase/meta/types/Visualization";

type Props = VisualizationProps & {
  viewNextObjectDetail: () => void,
  viewPreviousObjectDetail: () => void,
};

const mapStateToProps = () => ({});

const mapDispatchToProps = {
  viewPreviousObjectDetail,
  viewNextObjectDetail,
};

export class ObjectDetail extends Component {
  props: Props;

  static uiName = t`Object Detail`;
  static identifier = "object";
  static iconName = "document";
  static noun = t`object`;

  static hidden = true;

  componentDidMount() {
    // load up FK references
    this.props.loadObjectDetailFKReferences();
    window.addEventListener("keydown", this.onKeyDown, true);
  }

  componentWillUnmount() {
    window.removeEventListener("keydown", this.onKeyDown, true);
  }

  componentWillReceiveProps(nextProps) {
    // if the card has changed then reload fk references
    if (this.props.data != nextProps.data) {
      this.props.loadObjectDetailFKReferences();
    }
  }

  getIdValue() {
    if (!this.props.data) {
      return null;
    }

    const { data: { cols, rows } } = this.props;
    const columnIndex = _.findIndex(cols, col => isPK(col));
    return rows[0][columnIndex];
  }

  foreignKeyClicked = fk => {
    this.props.followForeignKey(fk);
  };

  cellRenderer(column, value, isColumn) {
    const { onVisualizationClick, visualizationIsClickable } = this.props;

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
        let formattedJson = JSON.stringify(JSON.parse(value), null, 2);
        cellValue = <pre className="ObjectJSON">{formattedJson}</pre>;
      } else if (typeof value === "object") {
        let formattedJson = JSON.stringify(value, null, 2);
        cellValue = <pre className="ObjectJSON">{formattedJson}</pre>;
      } else {
        cellValue = formatValue(value, {
          column: column,
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
    const { data: { cols, rows } } = this.props;
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
    let { tableForeignKeys, tableForeignKeyReferences } = this.props;
    if (!tableForeignKeys) {
      return null;
    }

    tableForeignKeys = tableForeignKeys.filter(fk =>
      isQueryable(fk.origin.table),
    );

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
    if (!this.props.data) {
      return false;
    }

    const tableName = this.props.tableMetadata
      ? singularize(this.props.tableMetadata.display_name)
      : t`Unknown`;
    // TODO: once we nail down the "title" column of each table this should be something other than the id
    const idValue = this.getIdValue();

    return (
      <div className="ObjectDetail rounded mt2">
        <div className="Grid ObjectDetail-headingGroup">
          <div className="Grid-cell ObjectDetail-infoMain px4 py3 ml2 arrow-right">
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
        </div>
        <div className="Grid">
          <div className="Grid-cell ObjectDetail-infoMain p4">
            {this.renderDetailsTable()}
          </div>
          <div className="Grid-cell Cell--1of3 bg-alt">
            {this.renderRelationships()}
          </div>
        </div>
        <div
          className={cx("fixed left cursor-pointer text-brand-hover lg-ml2", {
            disabled: idValue <= 1,
          })}
          style={{ top: "50%", left: "1em", transform: "translate(0, -50%)" }}
        >
          <DirectionalButton
            direction="back"
            onClick={this.props.viewPreviousObjectDetail}
          />
        </div>
        <div
          className="fixed right cursor-pointer text-brand-hover lg-ml2"
          style={{ top: "50%", right: "1em", transform: "translate(0, -50%)" }}
        >
          <DirectionalButton
            direction="forward"
            onClick={this.props.viewNextObjectDetail}
          />
        </div>
      </div>
    );
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(ObjectDetail);
