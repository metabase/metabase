import { useState, useCallback, ReactElement } from "react";
import type { FormikValues } from "formik";
import { Collection, CollectionId } from "metabase-types/api";
import CreateCollectionModal from "metabase/collections/containers/CreateCollectionModal";

export interface Values extends FormikValues {
  collection_id: CollectionId;
}

interface State {
  enabled: boolean;
  resumedValues?: Values;
  openCollectionId?: CollectionId;
}

export type OnClickNewCollection = (
  resumedValues: Values,
  openCollectionId: CollectionId,
) => void;

type RenderChildFn = (
  resumedValues: Values | undefined,
  onClickNewCollection: OnClickNewCollection,
) => ReactElement;

export function CreateCollectionOnTheGo({
  children,
}: {
  children: RenderChildFn;
}) {
  const [state, setState] = useState<State>({
    enabled: false,
  });
  const { enabled, openCollectionId, resumedValues } = state;

  const onClickNewCollection = useCallback<OnClickNewCollection>(
    (resumedValues, openCollectionId) =>
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
