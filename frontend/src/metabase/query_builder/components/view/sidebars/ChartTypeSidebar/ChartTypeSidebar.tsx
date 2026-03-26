import cx from "classnames";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { SidebarContent } from "metabase/common/components/SidebarContent";
import { useSetting, useToast } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/lib/redux";
import {
  onCloseChartType,
  onOpenChartSettings,
  setUIControls,
  updateQuestion,
} from "metabase/query_builder/actions";
import {
  ChartTypeSettings,
  type GetSensibleVisualizationsProps,
  type UseQuestionVisualizationStateProps,
  getSensibleVisualizations,
  useQuestionVisualizationState,
} from "metabase/query_builder/components/chart-type-selector";
import {
  loadCustomVizPlugin,
  useCustomVizPlugins,
} from "metabase/visualizations/custom-viz-plugins";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { CardDisplayType } from "metabase-types/api";

export type ChartTypeSidebarProps = Pick<
  UseQuestionVisualizationStateProps,
  "question"
> &
  GetSensibleVisualizationsProps;

export const ChartTypeSidebar = ({
  question,
  result,
}: ChartTypeSidebarProps) => {
  const dispatch = useDispatch();
  const [sendToast] = useToast();
  const customVizEnabled = useSetting("custom-viz-enabled");
  const customVizPlugins = useCustomVizPlugins({ enabled: customVizEnabled });
  const [pluginsLoaded, setPluginsLoaded] = useState(false);

  const onInfo = useCallback(
    (message: string) => sendToast({ message }),
    [sendToast],
  );

  // Eagerly load all custom viz plugins so they register in the
  // visualizations Map and can be rendered by ChartTypeOption.
  useEffect(() => {
    if (!customVizPlugins || customVizPlugins.length === 0) {
      setPluginsLoaded(true);
      return;
    }

    let cancelled = false;
    Promise.all(
      customVizPlugins.map((plugin) =>
        loadCustomVizPlugin(plugin, undefined, onInfo),
      ),
    ).then(() => {
      if (!cancelled) {
        setPluginsLoaded(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [customVizPlugins, onInfo]);

  const onUpdateQuestion = (newQuestion: Question) => {
    if (question) {
      dispatch(
        updateQuestion(newQuestion, {
          shouldUpdateUrl: Lib.queryDisplayInfo(question.query()).isEditable,
        }),
      );
      dispatch(setUIControls({ isShowingRawTable: false }));
    }
  };

  const { sensibleVisualizations, nonSensibleVisualizations } = useMemo(
    () => getSensibleVisualizations({ result }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute after plugins are loaded
    [result, pluginsLoaded],
  );

  const { selectedVisualization, updateQuestionVisualization } =
    useQuestionVisualizationState({
      question,
      onUpdateQuestion,
    });

  const handleSelectVisualization = (display: CardDisplayType) => {
    updateQuestionVisualization(display);
  };

  const onOpenVizSettings = () => {
    dispatch(
      onOpenChartSettings({
        initialChartSettings: { section: t`Data` },
        showSidebarTitle: true,
      }),
    );
  };

  return (
    <SidebarContent
      className={cx(CS.fullHeight, CS.px1)}
      onDone={() => dispatch(onCloseChartType())}
      data-testid="chart-type-sidebar"
    >
      <ChartTypeSettings
        selectedVisualization={selectedVisualization}
        onSelectVisualization={handleSelectVisualization}
        sensibleVisualizations={sensibleVisualizations}
        nonSensibleVisualizations={nonSensibleVisualizations}
        customVizPlugins={customVizPlugins}
        onOpenSettings={onOpenVizSettings}
        gap={0}
        w="100%"
        p="lg"
      />
    </SidebarContent>
  );
};
