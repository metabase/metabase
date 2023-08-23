import type * as React from "react";

import type { CustomFormProps } from "metabase/components/form/FormikCustomForm";
import CustomForm from "metabase/components/form/FormikCustomForm";
import StandardForm from "metabase/components/form/FormikStandardForm";

import type { BaseFieldValues } from "metabase-types/forms";

function FormView<Values extends BaseFieldValues>(
  props: CustomFormProps<Values> & {
    formComponent?: React.ComponentType<CustomFormProps<Values>>;
  },
) {
  const FormComponent =
    props.formComponent || (props.children ? CustomForm : StandardForm);

  return <FormComponent {...props} />;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormView;
