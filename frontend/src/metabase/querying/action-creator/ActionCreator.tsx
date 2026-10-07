import { ActionCreator as ActionCreatorContent } from "metabase/actions/containers/ActionCreator/ActionCreator";
import {
  skipToken,
  useGetActionQuery,
  useGetCardQuery,
  useListDatabasesQuery,
} from "metabase/api";
import type {
  Card,
  CardId,
  Database,
  WritebackAction,
  WritebackActionId,
} from "metabase-types/api";

export interface ActionCreatorProps {
  actionId?: WritebackActionId;
  modelId?: CardId;

  action?: WritebackAction;
  /**
   * Whether the creator is mounted as its own route. A routed creator guards
   * leaving with `LeaveRouteConfirmModal`; an inline one only has `beforeunload`.
   */
  isRouted?: boolean;

  onSubmit?: (action: WritebackAction) => void;
  onClose?: () => void;
}

export function ActionCreator({
  actionId,
  modelId,
  action,
  isRouted,
  onSubmit,
  onClose,
}: ActionCreatorProps) {
  const { data: databases } = useListDatabasesQuery();
  const { data: model } = useGetCardQuery(
    modelId != null ? { id: modelId } : skipToken,
  );
  // `dataset_query.database` and not `database_id`: the v1 wrapper this
  // replaced read the database off the query, and the two can differ.
  const modelDatabase = databases?.data.find(
    (database) => database.id === model?.dataset_query.database,
  );
  const { data: initialAction } = useGetActionQuery(
    actionId != null ? { id: actionId } : skipToken,
  );
  // This is needed in case we already have an action and pass it from the outside
  const contextAction = action || initialAction;

  if (contextAction?.type !== "implicit") {
    return null;
  }

  return (
    <ActionCreatorContent
      action={contextAction}
      canWriteModelActions={canWriteActions(model, modelDatabase)}
      isRouted={isRouted}
      onSubmit={onSubmit}
      onClose={onClose}
    />
  );
}

function canWriteActions(
  model: Card | undefined,
  database: Database | undefined,
): boolean {
  return (
    model?.can_write === true &&
    database?.native_permissions === "write" &&
    Boolean(database.settings?.["database-enable-actions"])
  );
}
