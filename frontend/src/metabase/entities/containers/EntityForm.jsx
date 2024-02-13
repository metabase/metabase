/* eslint-disable react/prop-types */
import { Component } from "react";
import { t } from "ttag";

import ModalContent from "metabase/components/ModalContent";
import {
  isInstanceAnalyticsCollection,
  getInstanceAnalyticsCustomCollection,
} from "metabase/collections/utils";
import entityType from "./EntityType";

export function getForm(entityDef) {
  // 1. default `form`
  // 2. first of the named `forms`
  return entityDef.form || Object.values(entityDef.forms)[0];
}

const EForm = ({
  entityDef,
  entityObject,
  form = getForm(entityDef),
  update,
  create,
  onSubmit = object => (object.id ? update(object) : create(object)),
  onSaved,
  resumedValues,
  collections,
  ...props
}) => {
  // custom lazy loading to prevent circular deps problem
  const FormikForm = require("metabase/containers/FormikForm").default;
  const initialValues =
    typeof entityObject?.getPlainObject === "function"
      ? entityObject.getPlainObject()
      : entityObject;

  let isCustomCollectionLoaded = false;
  if (isInstanceAnalyticsCollection(entityObject?.collection)) {
    const customCollection = getInstanceAnalyticsCustomCollection(collections);
    if (customCollection) {
      isCustomCollectionLoaded = true;
      initialValues.collection_id = customCollection.id;
    }
  }

  return (
    <FormikForm
      key={isCustomCollectionLoaded}
      {...props}
      form={form}
      initialValues={{ ...initialValues, ...resumedValues }}
      onSubmit={onSubmit}
      onSubmitSuccess={action => onSaved && onSaved(action.payload.object)}
    />
  );
};

const Modal = ({
  children,
  title: titleProp,
  entityDef,
  entityObject,
  onClose,
}) => {
  const parseTitleFromEntity = () =>
    entityObject?.id
      ? entityDef.objectSelectors.getName(entityObject)
      : t`New ${entityDef.displayNameOne}`;

  const title = titleProp || parseTitleFromEntity();

  return (
    <ModalContent title={title} onClose={onClose}>
      {children}
    </ModalContent>
  );
};

class EntityForm extends Component {
  render() {
    const { modal, ...props } = this.props;

    if (modal) {
      return (
        <Modal {...this.props}>
          <EForm {...props} isModal />
        </Modal>
      );
    } else {
      return <EForm {...props} />;
    }
  }
}

export default entityType()(EntityForm);
