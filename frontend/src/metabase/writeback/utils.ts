import type {
  ActionDashboardCard,
  BaseDashboardOrderedCard,
  Dashboard,
  Database as IDatabase,
  WritebackAction,
} from "metabase-types/api";
import type { SavedCard } from "metabase-types/types/Card";
import type { DashCard } from "metabase-types/types/Dashboard";

import { TYPE } from "metabase-lib/types/constants";
import type Database from "metabase-lib/metadata/Database";
import type Field from "metabase-lib/metadata/Field";

const DB_WRITEBACK_FEATURE = "actions";
const DB_WRITEBACK_SETTING = "database-enable-actions";

export const isDatabaseWritebackEnabled = (database?: IDatabase | null) =>
  !!database?.settings?.[DB_WRITEBACK_SETTING];

export const isWritebackSupported = (database?: Database | null) =>
  !!database?.hasFeature(DB_WRITEBACK_FEATURE);

const AUTOMATIC_DATE_TIME_FIELDS = [
  TYPE.CreationDate,
  TYPE.CreationTemporal,
  TYPE.CreationTime,
  TYPE.CreationTimestamp,

  TYPE.DeletionDate,
  TYPE.DeletionTemporal,
  TYPE.DeletionTime,
  TYPE.DeletionTimestamp,

  TYPE.UpdatedDate,
  TYPE.UpdatedTemporal,
  TYPE.UpdatedTime,
  TYPE.UpdatedTimestamp,
];

const isAutomaticDateTimeField = (field: Field) => {
  return AUTOMATIC_DATE_TIME_FIELDS.includes(field.semantic_type);
};

export const isEditableField = (field: Field) => {
  const isRealField = typeof field.id === "number";
  if (!isRealField) {
    // Filters out custom, aggregated columns, etc.
    return false;
  }

  if (field.isPK()) {
    // Most of the time PKs are auto-generated,
    // but there are rare cases when they're not
    // In this case they're marked as `database_required`
    return field.database_required;
  }

  if (isAutomaticDateTimeField(field)) {
    return field.database_required;
  }

  return true;
};

export const isActionCard = (card: SavedCard) => card?.display === "action";

export function isActionDashCard(
  dashCard: BaseDashboardOrderedCard,
): dashCard is ActionDashboardCard {
  const virtualCard = dashCard?.visualization_settings?.virtual_card;
  return isActionCard(virtualCard as SavedCard);
}

export const isLinkActionDashCard = (dashCard: BaseDashboardOrderedCard) =>
  isActionDashCard(dashCard) &&
  dashCard.visualization_settings?.click_behavior?.type === "link";

/**
 * Checks if a dashboard card is an explicit action (has associated WritebackAction).
 *
 * @param {BaseDashboardOrderedCard} dashboard card
 *
 * @returns {boolean} true if the button has an associated action.
 * False for implicit actions using click behavior, and in case a button has no action attached
 */
export function isMappedExplicitActionButton(
  dashCard: BaseDashboardOrderedCard,
): dashCard is ActionDashboardCard {
  const isAction = isActionDashCard(dashCard);
  return (
    isAction && typeof dashCard.visualization_settings.action_slug === "string"
  );
}

export function getActionButtonLabel(dashCard: ActionDashboardCard) {
  const label = dashCard.visualization_settings?.["button.label"];
  return label || "";
}

export const hasImplicitActions = (actions: WritebackAction[]): boolean =>
  actions.some(isImplicitAction);

export const isImplicitAction = (action: WritebackAction): boolean =>
  action.type === "implicit";

export const shouldPrefetchValues = (action: WritebackAction) => {
  // in the future there should be a setting to configure this
  // for custom actions
  return action.slug === "update";
};

export const shouldHideDashcardHeader = (
  dashboard: Dashboard,
  dashcard: DashCard,
): boolean =>
  !!(
    dashboard.is_app_page &&
    ["list", "object"].includes(dashcard?.card?.display ?? "")
  );
