import { ActionCreator as ActionCreatorContent } from "metabase/actions/containers/ActionCreator/ActionCreator";
import type { DataReferenceSlot } from "metabase/actions/containers/ActionCreator/types";
import {
  skipToken,
  useGetActionQuery,
  useGetCardQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
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
  useListDatabasesQuery();
  useGetCardQuery(modelId != null ? { id: modelId } : skipToken);
  const metadata = useSelector(getMetadata);
  const model =
    modelId != null ? (metadata.question(modelId) ?? undefined) : undefined;
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
        model={model}
        isRouted={isRouted}
        dataReference={DATA_REFERENCE}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    </ActionContextProvider>
  );
}
