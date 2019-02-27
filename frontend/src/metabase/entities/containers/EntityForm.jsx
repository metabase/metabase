/* @flow */

import React from "react";

import Form from "metabase/containers/Form";
import entityType from "./EntityType";

@entityType()
export default class EntityForm extends React.Component {
  render() {
    const {
      entityDef,
      entityObject,
      update,
      create,
      onSaved,
      ...props
    } = this.props;
    return (
      <Form
        {...props}
        form={entityDef.form}
        initialValues={entityObject}
        onSubmit={values =>
          values.id != null ? update(values) : create(values)
        }
        onSubmitSuccess={action => onSaved && onSaved(action.payload)}
      />
    );
  }
}
