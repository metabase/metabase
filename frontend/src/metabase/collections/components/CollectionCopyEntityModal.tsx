import { dissoc } from "icepick";
import { useState } from "react";
import { t } from "ttag";

import { useInitialCollectionId } from "metabase/collections/hooks";
import EntityCopyModal from "metabase/entities/containers/EntityCopyModal";
import { entityTypeForObject } from "metabase/entities/utils";

const getTitle = (entityObject: any, isShallowCopy: boolean) => {
  if (entityObject.model !== "dashboard") {
    return "";
  } else if (isShallowCopy) {
    return t`Duplicate "${entityObject.name}"`;
  } else {
    return t`Duplicate "${entityObject.name}" and its questions`;
  }
};

function CollectionCopyEntityModal({
  entityObject,
  onClose,
  onSaved,
}: {
  entityObject: any;
  onClose: () => void;
  onSaved: (newEntityObject: any) => void;
}) {
  const initialCollectionId = useInitialCollectionId({
    collectionId: entityObject.collection_id,
  });
  const [isShallowCopy, setIsShallowCopy] = useState(true);
  const title = getTitle(entityObject, isShallowCopy);

  const handleValuesChange = ({ is_shallow_copy }: Record<string, any>) => {
    setIsShallowCopy(is_shallow_copy);
  };

  const handleSaved = (newEntityObject: any) => {
    onSaved(newEntityObject);
  };

  return (
    <EntityCopyModal
      overwriteOnInitialValuesChange
      entityType={entityTypeForObject(entityObject)}
      entityObject={{
        ...entityObject,
        collection_id: initialCollectionId,
      }}
      title={title}
      copy={async (values) => {
        return entityObject.copy(dissoc(values, "id"));
      }}
      onClose={onClose}
      onSaved={handleSaved}
      onValuesChange={handleValuesChange}
    />
  );
}

// eslint-disable-next-line import/no-default-export
export default CollectionCopyEntityModal;
