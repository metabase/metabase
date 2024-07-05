import { isQuestionDashCard } from "metabase/dashboard/utils";
import {
  getColumnKey,
  getLegacyColumnKey,
  isLegacyColumnKey,
} from "metabase-lib/v1/queries/utils/get-column-key";
import type {
  Card,
  Dashboard,
  Field,
  VisualizationSettings,
} from "metabase-types/api";

export function migrateColumnSettings(
  columnSettings: VisualizationSettings["column_settings"],
  resultMetadata: Field[],
): VisualizationSettings {
  if (!Object.keys(columnSettings).some(isLegacyColumnKey)) {
    return columnSettings;
  }

  const columnByKey = Object.fromEntries(
    resultMetadata.map(column => [getLegacyColumnKey(column), column]),
  );

  return Object.fromEntries(
    Object.entries(columnSettings).map(([key, setting]) => {
      const column = columnByKey[key];
      return column && isLegacyColumnKey(key)
        ? [getColumnKey(column), setting]
        : [key, setting];
    }),
  );
}

export function migrateCardVizSettings(card: Card): Card {
  const { visualization_settings, result_metadata } = card;
  if (!visualization_settings || !result_metadata) {
    return card;
  }
  const { column_settings } = visualization_settings;
  if (!column_settings) {
    return card;
  }
  return {
    ...card,
    visualization_settings: {
      ...visualization_settings,
      column_settings: migrateColumnSettings(column_settings, result_metadata),
    },
  };
}

export function migrateDashboardVizSettings(dashboard: Dashboard): Dashboard {
  return {
    ...dashboard,
    dashcards: dashboard.dashcards?.map(dashcard => {
      if (!isQuestionDashCard(dashcard)) {
        return dashcard;
      }
      const { card, visualization_settings } = dashcard;
      if (!card || !visualization_settings) {
        return dashcard;
      }
      const { result_metadata } = card;
      if (!result_metadata) {
        return dashcard;
      }
      const { column_settings } = visualization_settings;
      if (!column_settings) {
        return {
          ...dashcard,
          card: migrateCardVizSettings(dashcard.card),
        };
      }
      return {
        ...dashcard,
        card: migrateCardVizSettings(dashcard.card),
        visualization_settings: {
          ...visualization_settings,
          column_settings: migrateColumnSettings(
            column_settings,
            result_metadata,
          ),
        },
      };
    }),
  };
}
