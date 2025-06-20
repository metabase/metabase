import { useCallback } from "react";
import { t } from "ttag";

import { getDashcardData } from "metabase/dashboard/selectors";
import { useSelector } from "metabase/lib/redux";
import { Icon, Menu } from "metabase/ui";
import {
  getInitialStateForCardDataSource,
  getInitialStateForMultipleSeries,
  getInitialStateForVisualizerCard,
  isVisualizerDashboardCard,
} from "metabase/visualizer/utils";
import type { Dataset } from "metabase-types/api";
import type { VisualizerVizDefinitionWithColumns } from "metabase-types/store/visualizer";

import type { UseDashcardMenuItemsProps } from "../types";

export const EditVisualizationMenuItem = ({
  series,
  dashcard,
  onEditVisualization,
}: Pick<
  UseDashcardMenuItemsProps,
  "series" | "dashcard" | "onEditVisualization"
>) => {
  const datasets = useSelector((state) => getDashcardData(state, dashcard.id));

  const onEditVisualizationClick = useCallback(() => {
    let initialState: VisualizerVizDefinitionWithColumns;

    if (isVisualizerDashboardCard(dashcard)) {
      initialState = getInitialStateForVisualizerCard(dashcard, datasets);
    } else if (series.length > 1) {
      initialState = getInitialStateForMultipleSeries(series);
    } else {
      initialState = getInitialStateForCardDataSource(
        series[0].card,
        series[0] as unknown as Dataset,
      );
    }

    onEditVisualization?.(dashcard, initialState);
  }, [dashcard, series, onEditVisualization, datasets]);

  return (
    <Menu.Item
      leftSection={<Icon name="pencil" />}
      onClick={() => onEditVisualizationClick()}
      closeMenuOnClick
    >
      {t`Edit visualization`}
    </Menu.Item>
  );
};
