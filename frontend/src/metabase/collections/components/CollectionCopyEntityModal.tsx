import { dissoc } from "icepick";
import { useState } from "react";
import { t } from "ttag";

import {
  useCopyDashboardMutation,
  useCopyDocumentMutation,
} from "metabase/api";
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
  const [copyDashboard] = useCopyDashboardMutation();
  const [copyDocument] = useCopyDocumentMutation();
  const initialCollectionId = useInitialCollectionId({
    collectionId: entityObject.collection_id,
  });
  const [isShallowCopy, setIsShallowCopy] = useState(true);
  const title = getTitle(entityObject, isShallowCopy);

  const handleValuesChange = ({ is_shallow_copy }: Record<string, any>) => {
    setIsShallowCopy(is_shallow_copy);
  };

  const handleCopy = async (values: Record<string, any>) => {
    const overrides = dissoc(values, "id");

    if (entityObject.model === "dashboard") {
      const { is_shallow_copy, ...rest } = overrides;
      return copyDashboard({
        id: entityObject.id,
        ...rest,
        is_deep_copy: !is_shallow_copy,
      }).unwrap();
    }

    if (entityObject.model === "document") {
      return copyDocument({
        id: entityObject.id,
        ...overrides,
      }).unwrap();
    }

    throw new Error(`Cannot duplicate entity of type "${entityObject.model}"`);
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
      copy={handleCopy}
      onClose={onClose}
      onSaved={onSaved}
      onValuesChange={handleValuesChange}
    />
  );
}

// eslint-disable-next-line import/no-default-export
export default CollectionCopyEntityModal;
