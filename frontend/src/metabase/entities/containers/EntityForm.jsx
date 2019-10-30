/* @flow */

import React from "react";
import { t } from "ttag";

import Form from "metabase/containers/Form";
import ModalContent from "metabase/components/ModalContent";

import entityType from "./EntityType";

@entityType()
export default class EntityForm extends React.Component {
  render() {
    const {
      entityDef,
      entityObject,
      form = entityDef.form || Object.values(entityDef.forms)[0],
      update,
      create,
      // defaults to `create` or `update` (if an id is present)
      onSubmit = object =>
        object.id != null ? update(object) : create(object),
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
            (entityObject && entityObject.id != null
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
