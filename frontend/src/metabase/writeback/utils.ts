import { TYPE } from "metabase/lib/types";

import type {
  ActionDashboardCard,
  BaseDashboardOrderedCard,
  ClickBehavior,
  Database as IDatabase,
} from "metabase-types/api";
import type { SavedCard } from "metabase-types/types/Card";
import type Database from "metabase-lib/lib/metadata/Database";
import type Field from "metabase-lib/lib/metadata/Field";

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

export function isValidImplicitActionClickBehavior(
  clickBehavior?: ClickBehavior,
) {
  if (
    !clickBehavior ||
    clickBehavior.type !== "action" ||
    !("actionType" in clickBehavior)
  ) {
    return false;
  }
  if (clickBehavior.actionType === "insert") {
    return clickBehavior.tableId != null;
  }
  if (
    clickBehavior.actionType === "update" ||
    clickBehavior.actionType === "delete"
  ) {
    return typeof clickBehavior.objectDetailDashCardId === "number";
  }
  return false;
}

export function isImplicitActionButton(
  dashCard: BaseDashboardOrderedCard,
): boolean {
  const isAction = isActionDashCard(dashCard);
  return (
    isAction &&
    dashCard.action_id == null &&
    isValidImplicitActionClickBehavior(
      dashCard.visualization_settings?.click_behavior,
    )
  );
}

export function getActionButtonLabel(dashCard: ActionDashboardCard) {
  const label = dashCard.visualization_settings?.["button.label"];
  return label || "";
}
