import { ActionCreator as ActionCreatorContent } from "metabase/actions/containers/ActionCreator/ActionCreator";
import type { DataReferenceSlot } from "metabase/actions/containers/ActionCreator/types";
import {
  skipToken,
  useGetActionQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { getUserIsAdmin } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import type {
  CardId,
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
  const isAdmin = useSelector(getUserIsAdmin);
  const { data: databases } = useListDatabasesQuery();
  const { data: initialAction } = useGetActionQuery(
    actionId != null ? { id: actionId } : skipToken,
  );
  // This is needed in case we already have an action and pass it from the outside
  const contextAction = action || initialAction;
  const savedAction = initialAction ?? action;
  const actionDatabase = databases?.data.find(
    (database) => database.id === savedAction?.database_id,
  );
  const canWriteAction =
    savedAction?.can_write === true &&
    Boolean(actionDatabase?.settings?.["database-enable-actions"]);

  return (
    <ActionContextProvider
      initialAction={contextAction}
      databaseId={databaseId}
    >
      <ActionCreatorContent
        modelId={modelId}
        canCreateActions={isAdmin}
        canWriteAction={canWriteAction}
        isRouted={isRouted}
        dataReference={DATA_REFERENCE}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    </ActionContextProvider>
  );
}
