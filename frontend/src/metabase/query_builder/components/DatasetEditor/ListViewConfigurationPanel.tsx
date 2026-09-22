import { useCallback, useMemo } from "react";

import { skipToken, useGetTableQuery } from "metabase/api";
import { useDispatch } from "metabase/redux";
import { ListViewConfiguration } from "metabase/visualizations/visualizations/List/components/ListView";
import {
  type ComputedVisualizationSettings,
  extractRemappings,
  getComputedSettingsForSeries,
  getVisualizationTransformed,
} from "metabase/viz-core";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import {
  type IconName,
  type RawSeries,
  type Series,
  isConcreteTableId,
} from "metabase-types/api";

import { updateQuestion as updateQuestionAction } from "../../actions";

export function getComputedVisualizationSettings(
  series: Series | null,
): ComputedVisualizationSettings | null {
  if (series == null) {
    return series;
  }

  return getComputedSettingsForSeries(
    getVisualizationTransformed(extractRemappings(series)).series,
  );
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

  // A saved question's virtual table has no entity type, so only a real table
  // is worth asking for.
  const sourceTableId = useMemo(() => {
    try {
      const id = Lib.sourceTableOrCardId(question.query());
      return id != null && isConcreteTableId(id) ? id : undefined;
    } catch {
      return undefined;
    }
  }, [question]);

  const { data: table } = useGetTableQuery(
    sourceTableId != null ? { id: sourceTableId } : skipToken,
  );
  const entityType = table?.entity_type ?? undefined;

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
