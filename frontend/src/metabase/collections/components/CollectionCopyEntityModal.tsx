import { dissoc } from "icepick";
import { useState } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import Collections from "metabase/entities/collections";
import EntityCopyModal from "metabase/entities/containers/EntityCopyModal";
import withToast from "metabase/hoc/Toast";
import { entityTypeForObject } from "metabase/lib/schema";

function mapStateToProps(state: any, props: any) {
  return {
    initialCollectionId: Collections.selectors.getInitialCollectionId(state, {
      ...props,
      collectionId: props.entityObject.collection_id,
    }),
  };
}

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
  initialCollectionId,
  onClose,
  onSaved,
}: {
  entityObject: any;
  initialCollectionId: number;
  onClose: () => void;
  onSaved: (newEntityObject: any) => void;
}) {
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
      copy={async values => {
        return entityObject.copy(dissoc(values, "id"));
      }}
      onClose={onClose}
      onSaved={handleSaved}
      onValuesChange={handleValuesChange}
    />
  );
}

// eslint-disable-next-line import/no-default-export
export default withToast(connect(mapStateToProps)(CollectionCopyEntityModal));
