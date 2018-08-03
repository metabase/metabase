/* @flow */

import React, { Component } from "react";

import TableInteractiveSummary from "../components/TableInteractiveSummary.jsx";
import TableSimpleSummary from "../components/TableSimpleSummary.jsx";
import { t } from "c-3po";

import {
  getFriendlyName,
} from "metabase/visualizations/lib/utils";
import SummaryTableColumnsSetting from "metabase/visualizations/components/settings/SummaryTableColumnsSetting.jsx";

import _ from "underscore";
import cx from "classnames";
import RetinaImage from "react-retina-image";
import { getIn } from "icepick";

import type {DatasetData, SummaryDatasetData} from "metabase/meta/types/Dataset";
import type { Card, VisualizationSettings } from "metabase/meta/types/Card";

import { GroupingManager } from "../lib/GroupingManager";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import type {RawSeries} from "metabase/meta/types/Visualization";
import type {ValueSerialized} from "metabase/meta/types/summary_table";
import {settingsAreValid} from "metabase/visualizations/lib/settings/summary_table";
import connect from "react-redux/es/connect/connect";


type Props = {
  card: Card,
  data: SummaryDatasetData,
  rawSeries: RawSeries,
  settings: VisualizationSettings,
  isDashboard: boolean,
  query: StructuredQuery,
  ddd: string;
};
type State = {
  data: ?DatasetData,
  query: any
};


export const COLUMNS_SETTINGS = "summaryTable.columns";

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
      isValid: ([{ card, data }]) =>
        settingsAreValid(card.visualization_settings[COLUMNS_SETTINGS], data),
      getDefault: ([{data : {columns}}]) : ValueSerialized =>
        {
          const gs = columns.slice(0, columns.length -1);
          const vs = columns.slice(columns.length -1);
          return {groupsSources : gs, columnsSource: null, valuesSources: vs, columnNameToMetadata: gs.reduce((acc, column) => ({...acc, [column]: {showTotals : true}}), {} )}


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
    "summaryTable.column_widths": {},
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
    data,
    settings
  }: {
    data: SummaryDatasetData,
    settings: VisualizationSettings
  }) {
 {

   //todo: fix 30
   const groupingManager = new GroupingManager(30, settings, [data,...(data.totalsData || [])]);


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


