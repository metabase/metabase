import React from "react";

import FormField from "metabase/components/form/FormField";
import FormWidget from "metabase/components/form/FormWidget";
import FormMessage from "metabase/components/form/FormMessage";

import Button from "metabase/components/Button";

import cx from "classnames";
import { getIn } from "icepick";

const StandardForm = ({
  fields,
  submitting,
  error,
  dirty,
  invalid,
  values,
  handleSubmit,
  resetForm,

  form,
  className,
  resetButton = false,
  newForm = true,

  ...props
}) => (
  <form onSubmit={handleSubmit} className={cx(className, { NewForm: newForm })}>
    <div className="m1">
      {form.fields(values).map(formField => {
        const nameComponents = formField.name.split(".");
        const field = getIn(fields, nameComponents);
        return (
          <FormField
            key={formField.name}
            displayName={
              formField.title || nameComponents[nameComponents.length - 1]
            }
            offset={!newForm}
            {...field}
            hidden={formField.type === "hidden"}
          >
            <FormWidget field={field} offset={!newForm} {...formField} />
            {!newForm && <span className="Form-charm" />}
          </FormField>
        );
      })}
    </div>
    <div className={cx("m1", { "Form-offset": !newForm })}>
      <Button
        type="submit"
        primary
        disabled={submitting || invalid}
        className="mr1"
      >
        {values.id != null ? "Update" : "Create"}
      </Button>
      {resetButton && (
        <Button
          type="button"
          disabled={submitting || !dirty}
          onClick={resetForm}
        >
          Reset
        </Button>
      )}
      {error && <FormMessage message={error} formError />}
    </div>
  </form>
);

export default StandardForm;
