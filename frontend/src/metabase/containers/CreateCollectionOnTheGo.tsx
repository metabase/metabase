import { useState, createContext, Children, useCallback } from "react";
import { Collection, CollectionId } from "metabase-types/api";
import CreateCollectionModal from "metabase/collections/containers/CreateCollectionModal";
import { NewCollectionButton } from "metabase/collections/containers/FormCollectionPicker/FormCollectionPicker";

// TODO: learn about templated types in TypeScript

// TODO: only context should be the button, which encapsulates access to internal state needed to open the model and update state

export const CreateCollectionOnTheGoButtonContext =
  createContext<Function | null>(null);

interface State {
  enabled?: boolean;
  resumedValues?: any;
  openCollectionId?: CollectionId;
}

export function CreateCollectionOnTheGo(props: any) {
  const [state, setState] = useState<State>({});
  const { enabled, openCollectionId, resumedValues } = state;

  const CreateCollectionOnTheGoButton = useCallback(
    ({
      resumedValues,
      openCollectionId,
    }: {
      resumedValues: any;
      openCollectionId: CollectionId;
    }) => (
      <NewCollectionButton
        onClick={() =>
          setState({
            ...state,
            enabled: true,
            resumedValues,
            openCollectionId,
          })
        }
      />
    ),
    [state, setState],
  );

  if (enabled) {
    return (
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
    );
  }

  const child = Children.only(props.children);
  return (
    <CreateCollectionOnTheGoButtonContext.Provider
      value={CreateCollectionOnTheGoButton}
    >
      {child(resumedValues)}
    </CreateCollectionOnTheGoButtonContext.Provider>
  );
}
