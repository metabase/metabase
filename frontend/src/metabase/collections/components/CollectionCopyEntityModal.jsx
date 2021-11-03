/* eslint-disable react/prop-types */
import React from "react";
import { connect } from "react-redux";
import { dissoc } from "icepick";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import withToast from "metabase/hoc/Toast";
import { entityTypeForObject } from "metabase/lib/schema";

import Link from "metabase/components/Link";

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

function CollectionCopyEntityModal({
  entityObject,
  initialCollectionId,
  onClose,
  onSaved,
  triggerToast,
}) {
  return (
    <EntityCopyModal
      overwriteOnInitialValuesChange
      entityType={entityTypeForObject(entityObject)}
      entityObject={{
        ...entityObject,
        collection_id: initialCollectionId,
      }}
      copy={async values => {
        return entityObject.copy(dissoc(values, "id"));
      }}
      onClose={onClose}
      onSaved={newEntityObject => {
        const newEntityUrl = Urls.modelToUrl({
          model: entityObject.model,
          model_object: newEntityObject,
        });
        triggerToast(
          <div className="flex align-center">
            {t`Duplicated ${entityObject.model}`}
            <Link className="link text-bold ml1" to={newEntityUrl}>
              {t`See it`}
            </Link>
          </div>,
          { icon: entityObject.model },
        );

        onSaved(newEntityObject);
      }}
    />
  );
}

export default withToast(connect(mapStateToProps)(CollectionCopyEntityModal));
