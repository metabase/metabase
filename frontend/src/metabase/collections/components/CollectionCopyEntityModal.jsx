/* eslint-disable react/prop-types */
import { useState } from "react";
import { connect } from "react-redux";
import { dissoc } from "icepick";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import withToast from "metabase/hoc/Toast";
import { entityTypeForObject } from "metabase/lib/schema";

import Link from "metabase/core/components/Link";

import Dashboards from "metabase/entities/dashboards";
import Collections from "metabase/entities/collections";
import EntityCopyModal from "metabase/entities/containers/EntityCopyModal";

function mapStateToProps(state, props) {
  return {
    initialCollectionId: Collections.selectors.getInitialCollectionId(state, {
      ...props,
      collectionId: props.entityObject.collection_id,
    }),
  };
}

const getTitle = (entityObject, isShallowCopy) => {
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
  triggerToast,
}) {
  const [isShallowCopy, setIsShallowCopy] = useState(true);
  const title = getTitle(entityObject, isShallowCopy);

  const handleValuesChange = ({ is_shallow_copy }) => {
    setIsShallowCopy(is_shallow_copy);
  };

  const handleSaved = newEntityObject => {
    const newEntityUrl = Urls.modelToUrl({
      model: entityObject.model,
      model_object: newEntityObject,
    });

    triggerToast(
      <div className="flex align-center">
        {/* A shallow-copied newEntityObject will not include `uncopied` */}
        {newEntityObject.uncopied?.length > 0
          ? t`Duplicated ${entityObject.model}, but couldn't duplicate some questions`
          : t`Duplicated ${entityObject.model}`}
        <Link className="link text-bold ml1" to={newEntityUrl}>
          {t`See it`}
        </Link>
      </div>,
      { icon: entityObject.model },
    );

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
      form={Dashboards.forms.duplicate}
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

export default withToast(connect(mapStateToProps)(CollectionCopyEntityModal));
