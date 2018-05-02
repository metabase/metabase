import React from "react";

import FormField from "metabase/components/form/FormField";
import FormLabel from "metabase/components/form/FormLabel";
import FormMessage from "metabase/components/form/FormMessage";
import FormWidget from "metabase/components/form/FormWidget";

import Button from "metabase/components/Button";

import cx from "classnames";

const StandardForm = ({
  form,
  fields,
  handleSubmit,
  resetForm,
  submitting,
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
      {form.fields.map(formField => (
        <FormField
          key={formField.name}
          displayName={formField.title || formField.name}
          offset={!newForm}
          {...fields[formField.name]}
        >
          <FormWidget
            field={fields[formField.name]}
            offset={!newForm}
            {...formField}
          />
          {!newForm && <span className="Form-charm" />}
        </FormField>
      ))}
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
    </div>
  </form>
);

export default StandardForm;
