import { useCallback, useMemo } from "react";

import { updateQuestion as updateQuestionAction } from "metabase/query_builder/actions";
import { useDispatch } from "metabase/redux";
import {
  extractRemappings,
  getVisualizationTransformed,
} from "metabase/visualizations";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { ListViewConfiguration } from "metabase/visualizations/visualizations/List/components/ListView";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { IconName, RawSeries, Series } from "metabase-types/api";

export function getComputedVisualizationSettings(
  series: Series | null,
): ComputedVisualizationSettings | null {
  if (series == null) {
    return series;
  }

  return getComputedSettingsForSeries(
    getVisualizationTransformed(extractRemappings(series)).series,
  ) as ComputedVisualizationSettings;
}

type ListViewConfigurationPanelProps = {
  question: Question;
  rawSeries: RawSeries | null;
};

/**
 * Renders the list view column configuration UI in place of the dataset
 * editor's table preview while the user is arranging list columns.
 */
export const ListViewConfigurationPanel = ({
  question,
  rawSeries,
}: ListViewConfigurationPanelProps) => {
  const dispatch = useDispatch();

  const data = rawSeries?.[0]?.data;

  const settings = useMemo(
    () => getComputedVisualizationSettings(rawSeries) ?? undefined,
    [rawSeries],
  );

  const columnsMetadata = useMemo(() => {
    if (!data) {
      return [];
    }
    const query = question.query();
    return data.cols.map((col) => Lib.fromLegacyColumn(query, -1, col));
  }, [data, question]);

  const entityType = useMemo(() => {
    try {
      const query = question.query();
      const sourceTableId = Lib.sourceTableOrCardId(query);
      const table = question.metadata().table(sourceTableId);
      // entity_type exists in the database but not in the TypeScript types
      return (table as any)?.entity_type;
    } catch {
      return undefined;
    }
  }, [question]);

  const handleChange = useCallback(
    ({
      left,
      right,
      entityIcon,
      entityIconColor,
      entityIconEnabled,
      useImageColumn,
    }: {
      left?: string[];
      right?: string[];
      entityIcon?: IconName | null;
      entityIconColor?: string;
      entityIconEnabled?: boolean;
      useImageColumn?: boolean;
    }) => {
      const settings = { ...(question.settings() || {}) };
      if (left && right) {
        settings["list.columns"] = { left, right };
      }
      if (entityIcon !== undefined) {
        settings["list.entity_icon"] = entityIcon;
      }
      if (entityIconColor !== undefined) {
        settings["list.entity_icon_color"] = entityIconColor;
      }
      if (entityIconEnabled !== undefined) {
        settings["list.entity_icon_enabled"] = entityIconEnabled;
      }
      if (useImageColumn !== undefined) {
        settings["list.use_image_column"] = useImageColumn;
      }
      dispatch(updateQuestionAction(question.updateSettings(settings)));
    },
    [question, dispatch],
  );

  if (!data) {
    return null;
  }

  return (
    <ListViewConfiguration
      data={data}
      settings={settings}
      columnsMetadata={columnsMetadata}
      entityType={entityType}
      onChange={handleChange}
    />
  );
};
