import { useState } from "react";
import { useFormikContext } from "formik";
import { Collection, CollectionId } from "metabase-types/api";
import CreateCollectionModal from "metabase/collections/containers/CreateCollectionModal";
import { NewCollectionButton } from "metabase/collections/containers/FormCollectionPicker/FormCollectionPicker";

export function CreateCollectionOnTheGoModal(props) {
  const [enabled, setEnabled] = useState(false);
  const [resumedValues, setResumedValues] = useState(null);

  // TODO: use in FormCollectionPicker via context
  const [openCollectionId, setOpenCollectionId] = useState<CollectionId>();

  // TODO: use in CreateCollectionOnTheGoButton via context
  const openNewCollModal = _resumedValues => {
    setResumedValues(_resumedValues);
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

  // TODO: ensure that this props.children[0] is a function
  return props.children[0](resumedValues);
}

export function CreateCollectionOnTheGoButton(props) {
  // TODO: use context to get CreateCollectionOnTheGoModal’s openNewCollModal function
  const { values } = useFormikContext();
  return <NewCollectionButton onClick={() => openNewCollModal(values)} />;
}
