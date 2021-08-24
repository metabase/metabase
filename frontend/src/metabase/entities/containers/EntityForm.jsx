/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import Form from "metabase/containers/Form";
import ModalContent from "metabase/components/ModalContent";

import entityType from "./EntityType";

export function getForm(entityDef) {
  // 1. default `form`
  // 2. first of the named `forms`
  return entityDef.form || Object.values(entityDef.forms)[0];
}

@entityType()
export default class EntityForm extends React.Component {
  render() {
    const {
      entityDef,
      entityObject,
      form = getForm(entityDef),
      update,
      create,
      onSubmit = object => (object.id ? update(object) : create(object)),
      onClose,
      onSaved,
      modal,
      title,
      ...props
    } = this.props;

    const eForm = (
      <Form
        {...props}
        form={form}
        initialValues={entityObject}
        onSubmit={onSubmit}
        onSubmitSuccess={action => onSaved && onSaved(action.payload.object)}
      />
    );

    if (modal) {
      return (
        <ModalContent
          title={
            title ||
            (entityObject?.id
              ? entityDef.objectSelectors.getName(entityObject)
              : t`New ${entityDef.displayNameOne}`)
          }
          onClose={onClose}
        >
          {eForm}
        </ModalContent>
      );
    } else {
      return eForm;
    }
  }
}
