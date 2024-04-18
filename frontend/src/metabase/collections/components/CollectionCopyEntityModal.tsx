/* eslint-disable react/prop-types */
import cx from "classnames";
import { dissoc } from "icepick";
import { useState } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import Link from "metabase/core/components/Link";
import CS from "metabase/css/core/index.css";
import Collections from "metabase/entities/collections";
import EntityCopyModal from "metabase/entities/containers/EntityCopyModal";
import Dashboards from "metabase/entities/dashboards";
import withToast from "metabase/hoc/Toast";
import { entityTypeForObject } from "metabase/lib/schema";
import * as Urls from "metabase/lib/urls";

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
  //triggerToast,
}: {
  entityObject: any;
  initialCollectionId: number;
  onClose: () => void;
  onSaved: (newEntityObject: any) => void;
  //triggerToast: any; NOTE: This seems to be dead code
}) {
  const [isShallowCopy, setIsShallowCopy] = useState(true);
  const title = getTitle(entityObject, isShallowCopy);

  const handleValuesChange = ({ is_shallow_copy }: Record<string, any>) => {
    setIsShallowCopy(is_shallow_copy);
  };

  const handleSaved = (newEntityObject: any) => {
    const newEntityUrl = Urls.modelToUrl({
      model: entityObject.model,
      model_object: newEntityObject,
    });

    /// NOTE: I don't think triggerToast is ever set so I think this is dead code
    /// triggerToast(
    ///   <div className={cx(CS.flex, CS.alignCenter)}>
    ///     {/* A shallow-copied newEntityObject will not include `uncopied` */}
    ///     {newEntityObject.uncopied?.length > 0
    ///       ? t`Duplicated ${entityObject.model}, but couldn't duplicate some questions`
    ///       : t`Duplicated ${entityObject.model}`}
    ///     {newEntityUrl && (
    ///       <Link className={cx(CS.link, CS.textBold, CS.ml1)} to={newEntityUrl}>
    ///         {t`See it`}
    ///       </Link>
    ///     )}
    ///   </div>,
    ///   { icon: entityObject.model },
    /// );

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
