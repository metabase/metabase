/* eslint-disable react/prop-types */
import cx from "classnames";
import { connect } from "react-redux";

import CS from "metabase/css/core/index.css";
import {
  getQuestion,
  getVisualizationSettings,
} from "metabase/query_builder/selectors";
import { Icon } from "metabase/ui";

import AlertModalsS from "./AlertModals.module.css";
import { MultiSeriesAlertTip } from "./MultiSeriesAlertTip";
import { NormalAlertTip } from "./NormalAlertTip";

function RawDataAlertTipInner(props) {
  const display = props.question.display();
  const vizSettings = props.visualizationSettings;
  const goalEnabled = vizSettings["graph.show_goal"];
  const isLineAreaBar =
    display === "line" || display === "area" || display === "bar";
  const isMultiSeries =
    isLineAreaBar &&
    vizSettings["graph.metrics"] &&
    vizSettings["graph.metrics"].length > 1;
  const showMultiSeriesGoalAlert = goalEnabled && isMultiSeries;

  return (
    <div
      className={cx(
        AlertModalsS.AlertModalsBorder,
        CS.borderRowDivider,
        CS.p3,
        CS.flex,
        CS.alignCenter,
      )}
    >
      <div
        className={cx(
          AlertModalsS.AlertModalsBorder,
          CS.flex,
          CS.alignCenter,
          CS.justifyCenter,
          CS.p2,
          CS.mr2,
          CS.textMedium,
          CS.circle,
          CS.bgLight,
        )}
      >
        <Icon name="lightbulb" size="20" />
      </div>
      {showMultiSeriesGoalAlert ? <MultiSeriesAlertTip /> : <NormalAlertTip />}
    </div>
  );
}

export const RawDataAlertTip = connect(state => ({
  question: getQuestion(state),
  visualizationSettings: getVisualizationSettings(state),
}))(RawDataAlertTipInner);
