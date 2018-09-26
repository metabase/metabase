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
        onSubmitSuccess={action =>
          // maybe eventually pass the whole object instead of just the id?
          onSaved && onSaved({ id: action.payload.result })
        }
      />
    );
  }
}
