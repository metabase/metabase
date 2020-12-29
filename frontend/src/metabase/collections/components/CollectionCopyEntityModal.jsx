import React from "react";
import { dissoc } from "icepick";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import withToast from "metabase/hoc/Toast";
import { entityTypeForObject } from "metabase/schema";

import Link from "metabase/components/Link";

import EntityCopyModal from "metabase/entities/containers/EntityCopyModal";

function CollectionCopyEntityModal({
  entityObject,
  onClose,
  onSaved,
  triggerToast,
}) {
  return (
    <EntityCopyModal
      entityType={entityTypeForObject(entityObject)}
      entityObject={entityObject}
      copy={async values => {
        return entityObject.copy(dissoc(values, "id"));
      }}
      onClose={onClose}
      onSaved={newEntityObject => {
        triggerToast(
          <div className="flex align-center">
            {t`Duplicated ${entityObject.model}`}
            <Link
              className="link text-bold ml1"
              to={Urls.modelToUrl(entityObject.model, newEntityObject.id)}
            >
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

export default withToast(CollectionCopyEntityModal);
