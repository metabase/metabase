import React from "react";

import FormField from "metabase/components/form/FormField";
import FormWidget from "metabase/components/form/FormWidget";
import FormMessage from "metabase/components/form/FormMessage";

import Button from "metabase/components/Button";

import { t } from "c-3po";
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

  submitTitle,
  formDef: form,
  className,
  resetButton = false,
  newForm = true,
  onClose = null,

  ...props
}) => (
  <form onSubmit={handleSubmit} className={cx(className, { NewForm: newForm })}>
    <div>
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
    <div className={cx("flex", { "Form-offset": !newForm })}>
      <div className="ml-auto flex align-center">
        {onClose && (
          <Button
            type="button"
            className="mr1"
            onClick={onClose}
          >{t`Cancel`}</Button>
        )}
        <Button
          type="submit"
          primary={!(submitting || invalid)}
          disabled={submitting || invalid}
          className="mr1"
        >
          {submitTitle || (values.id != null ? t`Update` : t`Create`)}
        </Button>
        {resetButton && (
          <Button
            type="button"
            disabled={submitting || !dirty}
            onClick={resetForm}
          >
            {t`Reset`}
          </Button>
        )}
        {error && <FormMessage message={error} formError />}
      </div>
    </div>
  </form>
);

export default StandardForm;