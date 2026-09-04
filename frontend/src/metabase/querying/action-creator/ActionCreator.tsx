import { ActionCreator as ActionCreatorContent } from "metabase/actions/containers/ActionCreator/ActionCreator";
import type { DataReferenceSlot } from "metabase/actions/containers/ActionCreator/types";
import {
  skipToken,
  useGetActionQuery,
  useGetCardQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { getMetadata } from "metabase/metadata-store";
import { useSelector } from "metabase/redux";
import type {
  Card,
  CardId,
  Database,
  DatabaseId,
  WritebackAction,
  WritebackActionId,
} from "metabase-types/api";

import { ActionContextProvider } from "./ActionContextProvider";
import {
  DataReferenceInline,
  DataReferenceTriggerButton,
} from "./InlineDataReference";

export interface ActionCreatorProps {
  actionId?: WritebackActionId;
  modelId?: CardId;
  databaseId?: DatabaseId;

  action?: WritebackAction;
  /**
   * Whether the creator is mounted as its own route. A routed creator guards
   * leaving with `LeaveRouteConfirmModal`; an inline one only has `beforeunload`.
   */
  isRouted?: boolean;

  onSubmit?: (action: WritebackAction) => void;
  onClose?: () => void;
}

const DATA_REFERENCE: DataReferenceSlot = {
  TriggerButton: DataReferenceTriggerButton,
  Panel: DataReferenceInline,
};

export function ActionCreator({
  actionId,
  modelId,
  databaseId,
  action,
  isRouted,
  onSubmit,
  onClose,
}: ActionCreatorProps) {
  const { data: databases } = useListDatabasesQuery();
  const { data: model } = useGetCardQuery(
    modelId != null ? { id: modelId } : skipToken,
  );
  const metadata = useSelector(getMetadata);
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

  return (
    <ActionContextProvider
      initialAction={contextAction}
      databaseId={databaseId}
      metadata={metadata}
    >
      <ActionCreatorContent
        modelId={modelId}
        canWriteModelActions={canWriteActions(model, modelDatabase)}
        isRouted={isRouted}
        dataReference={DATA_REFERENCE}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    </ActionContextProvider>
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
