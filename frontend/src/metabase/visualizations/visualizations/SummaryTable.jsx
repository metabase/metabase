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
  getFriendlyName,
} from "metabase/visualizations/lib/utils";
import SummaryTableColumnsSetting, { settingsAreValid, getColumnsFromSettings} from "metabase/visualizations/components/settings/SummaryTableColumnsSetting.jsx";

import _ from "underscore";
import cx from "classnames";
import RetinaImage from "react-retina-image";
import { getIn } from "icepick";

import type { DatasetData } from "metabase/meta/types/Dataset";
import type { Card, VisualizationSettings } from "metabase/meta/types/Card";

import { GroupingManager } from "../lib/GroupingManager";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import {RawSeries, SingleSeries} from "metabase/meta/types/Visualization";

type Props = {
  card: Card,
  data: DatasetData,
  rawSeries: RawSeries,
  settings: VisualizationSettings,
  isDashboard: boolean,
  query: StructuredQuery,
};
type State = {
  data: ?DatasetData,
  query: any
};


export const COLUMNS_SETTINGS = "summaryTable"  + "." + "columns";


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
    [COLUMNS_SETTINGS]: {
      widget: SummaryTableColumnsSetting,
      getHidden: () => false,
      isValid: ([{ card, data }]) =>
        settingsAreValid(card.visualization_settings[COLUMNS_SETTINGS], data),
      getDefault: ([tmp]) =>
        {


          console.log(tmp);

            return {cols : []}

        // columnNameToMetadata:cols.reduce(
        //   (o, col) => ({ ...o, [col.name]: {enabled: col.visibility_type !== "details-only"} }),
        //   {},
        // )
      }
      ,
        // cols.map(col => ({
        //   name: col.name,
        //   //todo: ?details-only
        //   enabled: col.visibility_type !== "details-only",
        // })),
      getProps: ([props]) => ({
        columnNames: props.data.cols.reduce(
          (o, col) => ({ ...o, [col.name]: getFriendlyName(col) }),
          {},
        ),
      }),},
  };

  constructor(props: Props) {
    super(props);
    this.state = {
      data: null,
      query: props.query
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
    settings,
    rawSeries
  }: {
    data: DatasetData,
    settings: VisualizationSettings,
  }) {
 {
    const additionalSeries = ((rawSeries[0] || []).series || [])
   //todo: fix 30
   const groupingManager = new GroupingManager(30, settings, [...rawSeries,...additionalSeries]);


   this.setState({
        data: groupingManager
      });
    }
  }




  render() {
    const { card, isDashboard } = this.props;
    const { data } = this.state;
    const sort = getIn(card, ["dataset_query", "query", "order_by"]) || null;
    const isColumnsDisabled = false;
    //todo:
      // (settings[COLUMNS_SETTINGS] || []).filter(f => f.enabled).length < 1;
    const TableComponent = isDashboard ? TableSimpleSummary : TableInteractiveSummary;

    if (!data) {
      return null;
    }


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
          data={data}
          sort={sort}
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


