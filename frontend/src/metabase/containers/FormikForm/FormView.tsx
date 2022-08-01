import React from "react";
import _ from "underscore";

import CustomForm, {
  CustomFormProps,
} from "metabase/components/form/FormikCustomForm";
import StandardForm from "metabase/components/form/FormikStandardForm";

import { BaseFieldValues } from "metabase-types/forms";

function FormView<Values extends BaseFieldValues>(
  props: CustomFormProps<Values> & {
    formComponent?: React.ComponentType<CustomFormProps<Values>>;
  },
) {
  const FormComponent =
    props.formComponent || (props.children ? CustomForm : StandardForm);

  return <FormComponent {...props} />;
}

export default FormView;
