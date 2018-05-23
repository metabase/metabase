/* @flow */

import React, { Component } from "react";

import TableInteractiveSummary from "../components/TableInteractiveSummary.jsx";
import TableSimpleSummary from "../components/TableSimpleSummary.jsx";
import { t } from "c-3po";

//todo: remove
import * as DataGrid from "metabase/lib/data_grid";

import Query from "metabase/lib/query";
import { isMetric, isDimension } from "metabase/lib/schema_metadata";
import {
  columnsAreValid,
  getFriendlyName,
} from "metabase/visualizations/lib/utils";
import ChartSettingOrderedFields from "metabase/visualizations/components/settings/ChartSettingOrderedFields.jsx";

import _ from "underscore";
import cx from "classnames";
import RetinaImage from "react-retina-image";
import { getIn } from "icepick";

import type { DatasetData } from "metabase/meta/types/Dataset";
import type { Card, VisualizationSettings } from "metabase/meta/types/Card";

import { GroupingManager } from "../lib/GroupingManager";

type Props = {
  card: Card,
  data: DatasetData,
  settings: VisualizationSettings,
  isDashboard: boolean,
};
type State = {
  data: ?DatasetData,
};

const GRAND_TOTAL = SummaryTable.identifier + "." + "grandTotal";

export default class SummaryTable extends Component {
  props: Props;
  state: State;

  static uiName = t`Summary Table`;
  static identifier = "summaryTable";
  static iconName = "table";

  static minSize = { width: 4, height: 3 };

  static isSensible(cols, rows) {
    return true;
  }

  static checkRenderable([{ data: { cols, rows } }]) {
    // scalar can always be rendered, nothing needed here
  }

  static settings = {
    "table.pivot": {
      title: t`Pivot the table`,
      widget: "toggle",
      getHidden: ([{ card, data }]) => data && data.cols.length !== 3,
      getDefault: ([{ card, data }]) =>
        data &&
        data.cols.length === 3 &&
        Query.isStructured(card.dataset_query) &&
        data.cols.filter(isMetric).length === 1 &&
        data.cols.filter(isDimension).length === 2,
    },
    "table.dupa": {
      title: t`Dupa the table`,
      widget: "toggle",
      getHidden: ([{ card, data }]) => false,
      getDefault: ([{ card, data }]) => true,
    },
    "table.columns": {
      title: t`Fields to include`,
      widget: ChartSettingOrderedFields,
      getHidden: (series, vizSettings) => vizSettings["table.pivot"],
      isValid: ([{ card, data }]) =>
        card.visualization_settings["table.columns"] &&
        columnsAreValid(
          card.visualization_settings["table.columns"].map(x => x.name),
          data,
        ),
      getDefault: ([{ data: { cols } }]) =>
        cols.map(col => ({
          name: col.name,
          enabled: col.visibility_type !== "details-only",
        })),
      getProps: ([{ data: { cols } }]) => ({
        columnNames: cols.reduce(
          (o, col) => ({ ...o, [col.name]: getFriendlyName(col) }),
          {},
        ),
      }),
    },
    "table.column_widths": {},
  };

  constructor(props: Props) {
    super(props);

    this.state = {
      data: null,
    };
  }

  componentWillMount() {
    this._updateData(this.props);
  }

  componentWillReceiveProps(newProps: Props) {
    // TODO: remove use of deprecated "card" and "data" props
    if (
      newProps.data !== this.props.data ||
      !_.isEqual(newProps.settings, this.props.settings)
    ) {
      this._updateData(newProps);
    }
  }

  _updateData({
    data,
    settings,
  }: {
    data: DatasetData,
    settings: VisualizationSettings,
  }) {
    if (settings["table.pivot"]) {
      this.setState({
        data: DataGrid.pivot(data),
      });
    } else {
      const { cols, rows, columns } = data;
      const columnIndexes = settings["table.columns"]
        .filter(f => f.enabled)
        .map(f => _.findIndex(cols, c => c.name === f.name))
        .filter(i => i >= 0 && i < cols.length);

      this.setState({
        data: {
          cols: columnIndexes.map(i => cols[i]),
          columns: columnIndexes.map(i => columns[i]),
          rows: rows.map(row => columnIndexes.map(i => row[i])),
        },
      });
    }
  }

  render() {
    const { card, isDashboard, settings } = this.props;
    const { data } = this.state;
    const sort = getIn(card, ["dataset_query", "query", "order_by"]) || null;
    const isPivoted = settings["table.pivot"];
    const isColumnsDisabled =
      (settings["table.columns"] || []).filter(f => f.enabled).length < 1;
    const TableComponent = isDashboard ? TableSimpleSummary : TableInteractiveSummary;

    if (!data) {
      return null;
    }

    //todo: fix 30
    const groupingManager = new GroupingManager(30, [0,1], data.rows);

    const dataUpdated = { ...data, rows: groupingManager.rowsOrdered };

    if (isColumnsDisabled) {
      return (
        <div
          className={cx(
            "flex-full px1 pb1 text-centered flex flex-column layout-centered",
            { "text-slate-light": isDashboard, "text-slate": !isDashboard },
          )}
        >
          <RetinaImage
            width={99}
            src="app/assets/img/hidden-field.png"
            forceOriginalDimensions={false}
            className="mb2"
          />
          <span className="h4 text-bold">Every field is hidden right now</span>
        </div>
      );
    } else {
      return (
        // $FlowFixMe
        <TableComponent
          {...this.props}
          data={dataUpdated}
          isPivoted={isPivoted}
          sort={sort}
          groupingManager={groupingManager}
        />
      );
    }
  }
}

/**
 * A modified version of TestPopover for Jest/Enzyme tests.
 * It always uses TableSimple which Enzyme is able to render correctly.
 * TableInteractive uses react-virtualized library which requires a real browser viewport.
 */
export const TestTable = (props: Props) => (
  <SummaryTable {...props} isDashboard={true} />
);
TestTable.uiName = SummaryTable.uiName;
TestTable.identifier = SummaryTable.identifier;
TestTable.iconName = SummaryTable.iconName;
TestTable.minSize = SummaryTable.minSize;
TestTable.settings = SummaryTable.settings;

