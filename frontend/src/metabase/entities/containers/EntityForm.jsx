import React from "react";

import entityType from "./EntityType";
import { reduxForm } from "redux-form";

import StandardForm from "metabase/components/form/StandardForm";

@entityType()
export default class EntityForm extends React.Component {
  constructor(props) {
    super(props);
    this._updateForm(props);
  }

  static defaultProps = {
    children: StandardForm,
  };

  // dynamically generates a component decorated with reduxForm
  _updateForm(props) {
    const { entityDef, entityObject } = this.props;
    const { form } = entityDef;
    if (form) {
      const formConfig = {
        form: `entity-form-${entityDef.name}`,
        fields: ["id", ...form.fields.map(formField => formField.name)],
        validate: form.validate,
        initialValues:
          entityObject ||
          form.initialValues ||
          (form.getInitialValues && form.getInitialValues()),
      };
      this._FormComponent = reduxForm(formConfig)(({ children, ...props }) =>
        children({ ...props, form }),
      );
    }
  }

  render() {
    const { entityObject } = this.props;

    if (!this._FormComponent) {
      return <div>Missing form definition</div>;
    }

    const isUpdating = !!(entityObject && entityObject.id != null);

    const FormComponent = this._FormComponent;
    return (
      <FormComponent
        updating={isUpdating}
        creating={!isUpdating}
        onSubmit={async entityObject => {
          try {
            if (entityObject.id != null) {
              return await this.props.update(entityObject);
            } else {
              return await this.props.create(entityObject);
            }
          } catch (error) {
            console.error("EntityForm save failed", error);
            // redux-form expects { "FIELD NAME": "ERROR STRING" }
            throw error.data.errors;
          }
        }}
        onSubmitSuccess={
          this.props.onSaved &&
          (action => {
            // maybe eventually pass the whole object instead of just the id?
            this.props.onSaved({ id: action.payload.result });
          })
        }
        {...this.props}
      />
    );
  }
}
