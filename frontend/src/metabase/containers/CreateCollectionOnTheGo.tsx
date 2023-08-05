import { useState, createContext, useContext, Children } from "react";
import { useFormikContext } from "formik";
import { Collection, CollectionId } from "metabase-types/api";
import CreateCollectionModal from "metabase/collections/containers/CreateCollectionModal";
import { NewCollectionButton } from "metabase/collections/containers/FormCollectionPicker/FormCollectionPicker";

const CreateCollectionContext = createContext<any>({
  openModal: null,
});

export function CreateCollectionOnTheGo(props: any) {
  const [enabled, setEnabled] = useState(false);
  const [resumedValues, setResumedValues] = useState<any>(null);
  const [openCollectionId, setOpenCollectionId] = useState<CollectionId>();

  const openModal = (_resumedValues: any, _openCollectionId) => {
    setResumedValues(_resumedValues);
    setOpenCollectionId(_openCollectionId);
    setEnabled(true);
  };

  if (enabled) {
    return (
      <CreateCollectionModal
        collectionId={openCollectionId}
        onClose={() => setEnabled(false)}
        onCreate={(collection: Collection) => {
          setResumedValues({
            ...resumedValues,
            collection_id: collection.id,
          });
          setEnabled(false);
        }}
      />
    );
  }

  const child = Children.only(props.children);
  const context = { setOpenCollectionId, openModal };
  return (
    <CreateCollectionContext.Provider value={context}>
      {child(resumedValues)}
    </CreateCollectionContext.Provider>
  );
}

export function CreateCollectionOnTheGoButton(props: any) {
  const { openModal } = useContext(CreateCollectionContext);
  const { values } = useFormikContext();
  // TODO: figure out how to have FormCollectionPicker and CollectionPicker share current open collection, probably with prop
  return <NewCollectionButton onClick={() => openModal(values)} />;
}
