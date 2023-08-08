import { useState, useCallback, ReactElement } from "react";
import { Collection, CollectionId } from "metabase-types/api";
import CreateCollectionModal from "metabase/collections/containers/CreateCollectionModal";

interface State {
  enabled: boolean;
  resumedValues: any;
  openCollectionId?: CollectionId;
}

export type OnClickNewCollection = (
  resumedValues: any,
  openCollectionId: CollectionId,
) => void;

interface Props {
  children: (
    resumedValues: any,
    onClickNewCollection: OnClickNewCollection,
  ) => ReactElement;
}

export function CreateCollectionOnTheGo({ children }: Props) {
  const [state, setState] = useState<State>({
    enabled: false,
    resumedValues: {},
  });
  const { enabled, openCollectionId, resumedValues } = state;

  const onClickNewCollection = useCallback<OnClickNewCollection>(
    (resumedValues: any, openCollectionId: CollectionId) =>
      setState({ ...state, enabled: true, resumedValues, openCollectionId }),
    [state, setState],
  );

  return enabled ? (
    <CreateCollectionModal
      collectionId={openCollectionId}
      onClose={() => setState({ ...state, enabled: false })}
      onCreate={(collection: Collection) => {
        setState({
          ...state,
          resumedValues: { ...resumedValues, collection_id: collection.id },
          enabled: false,
        });
      }}
    />
  ) : (
    children(resumedValues, onClickNewCollection)
  );
}
