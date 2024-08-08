import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import {
  getQuestion,
  getVisualizationSettings,
} from "metabase/query_builder/selectors";
import { Icon } from "metabase/ui";
import type { VisualizationSettings } from "metabase-types/api";

import AlertModalsS from "./AlertModals.module.css";
import { MultiSeriesAlertTip } from "./MultiSeriesAlertTip";
import { NormalAlertTip } from "./NormalAlertTip";

export const RawDataAlertTip = () => {
  const question = useSelector(getQuestion);
  const visualizationSettings: VisualizationSettings = useSelector(
    getVisualizationSettings,
  );

  if (!question) {
    return null;
  }

  const display = question.display();
  const vizSettings = visualizationSettings;
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
};
