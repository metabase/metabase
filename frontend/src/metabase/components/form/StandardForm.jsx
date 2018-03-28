import React from "react";

import FormField from "metabase/components/form/FormField";
import FormWidget from "metabase/components/form/FormWidget";
import FormMessage from "metabase/components/form/FormMessage";

import Button from "metabase/components/Button";

import cx from "classnames";
import { getIn } from "icepick";

const StandardForm = ({
  form,
  fields,
  handleSubmit,
  resetForm,
  submitting,
  error,
  dirty,
  invalid,
  updating,
  className,
  resetButton = true,
  newForm = true,
  ...props
}) => (
  <form onSubmit={handleSubmit} className={cx(className, { NewForm: newForm })}>
    <div className="m1">
      {form.fields.map(formField => {
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
        {updating ? "Update" : "Create"}
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
