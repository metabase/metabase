import { useState, createContext, useCallback, ReactElement } from "react";
import { Collection, CollectionId } from "metabase-types/api";
import CreateCollectionModal from "metabase/collections/containers/CreateCollectionModal";
import { NewCollectionButton } from "metabase/collections/containers/FormCollectionPicker/FormCollectionPicker";

interface State {
  enabled: boolean;
  resumedValues: any;
  openCollectionId?: CollectionId;
}

interface Props {
  children: (resumedValues: any) => ReactElement;
}

interface ButtonProps {
  resumedValues: any;
  openCollectionId?: CollectionId;
}

type ButtonType = (buttonProps: ButtonProps) => ReactElement;
export const CreateCollectionOnTheGoButtonContext = createContext<ButtonType>(
  (buttonProps: ButtonProps) => <div />,
);

export function CreateCollectionOnTheGo({ children }: Props) {
  const [state, setState] = useState<State>({
    enabled: false,
    resumedValues: {},
  });
  const { enabled, openCollectionId, resumedValues } = state;

  const EnablingButton = useCallback(
    (buttonProps: ButtonProps) => (
      <NewCollectionButton
        onClick={() => setState({ ...state, ...buttonProps, enabled: true })}
      />
    ),
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
    <CreateCollectionOnTheGoButtonContext.Provider value={EnablingButton}>
      {children(resumedValues)}
    </CreateCollectionOnTheGoButtonContext.Provider>
  );
}
