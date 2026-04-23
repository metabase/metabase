import cx from "classnames";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { SidebarContent } from "metabase/common/components/SidebarContent";
import { useToast } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins";
import { updateQuestion } from "metabase/query_builder/actions";
import {
  ChartTypeSettings,
  type GetSensibleVisualizationsProps,
  type UseQuestionVisualizationStateProps,
  getSensibleVisualizations,
  useQuestionVisualizationState,
} from "metabase/query_builder/components/chart-type-selector";
import {
  onCloseChartType,
  onOpenChartSettings,
  setUIControls,
} from "metabase/redux/query-builder";
import { useDispatch } from "metabase/utils/redux";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { VisualizationDisplay } from "metabase-types/api";

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
  const { plugins: customVizPlugins } = PLUGIN_CUSTOM_VIZ.useCustomVizPlugins();
  const [pluginsLoaded, setPluginsLoaded] = useState(false);

  const onInfo = useCallback(
    (message: string) => sendToast({ message }),
    [sendToast],
  );

  // Eagerly load all custom viz plugins so they register in the
  // visualizations Map and can be rendered by ChartTypeOption.
  useEffect(() => {
    if (!customVizPlugins) {
      // Plugin list query still loading — don't mark loaded yet, otherwise
      // the later setPluginsLoaded(true) after bundles resolve is a no-op
      // and the picker never recomputes to include custom viz.
      return;
    }
    if (customVizPlugins.length === 0) {
      setPluginsLoaded(true);
      return;
    }

    let cancelled = false;
    Promise.all(
      customVizPlugins.map((plugin) =>
        PLUGIN_CUSTOM_VIZ.loadCustomVizPlugin(plugin, undefined, onInfo),
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

  // Pinned to mount so chart type grouping stays stable while browsing (metabase#70013)
  const initialResultRef = useRef(result);
  const { sensibleVisualizations, nonSensibleVisualizations } = useMemo(
    () => getSensibleVisualizations({ result: initialResultRef.current }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute after plugins are loaded
    [result, pluginsLoaded],
  );

  const { selectedVisualization, updateQuestionVisualization } =
    useQuestionVisualizationState({
      question,
      onUpdateQuestion,
    });

  const handleSelectVisualization = (display: VisualizationDisplay) => {
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
        onOpenSettings={onOpenVizSettings}
        gap={0}
        w="100%"
        p="lg"
      />
    </SidebarContent>
  );
};
