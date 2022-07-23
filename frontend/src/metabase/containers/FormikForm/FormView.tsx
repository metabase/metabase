import React from "react";
import _ from "underscore";

import CustomForm, {
  CustomFormProps,
} from "metabase/components/form/FormikCustomForm";
import StandardForm from "metabase/components/form/FormikStandardForm";

function FormView(
  props: CustomFormProps & {
    formComponent?: React.ComponentType<CustomFormProps>;
  },
) {
  const FormComponent =
    props.formComponent || (props.children ? CustomForm : StandardForm);

  return <FormComponent {...props} />;
}

export default FormView;
