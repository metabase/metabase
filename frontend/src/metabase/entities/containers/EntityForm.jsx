/* @flow */

import React from "react";
import { t } from "c-3po";

import Form from "metabase/containers/Form";
import ModalContent from "metabase/components/ModalContent";

import entityType from "./EntityType";

@entityType()
export default class EntityForm extends React.Component {
  render() {
    const {
      entityDef,
      object = this.props[entityDef.nameOne],
      update,
      create,
      onClose,
      onSaved,
      modal,
      title,
      ...props
    } = this.props;
    const form = (
      <Form
        {...props}
        form={entityDef.form}
        initialValues={object}
        onSubmit={object =>
          object.id != null ? update(object) : create(object)
        }
        onSubmitSuccess={action => onSaved && onSaved(action.payload.object)}
      />
    );
    if (modal) {
      return (
        <ModalContent
          title={
            title ||
            (object && object.id != null
              ? entityDef.objectSelectors.getName(object)
              : t`New ${entityDef.displayNameOne}`)
          }
          onClose={onClose}
        >
          {form}
        </ModalContent>
      );
    } else {
      return form;
    }
  }
}
