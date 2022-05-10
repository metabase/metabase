import React from "react";
import _ from "underscore";

import CustomForm, {
  CustomFormProps,
} from "metabase/components/form/CustomForm";
import StandardForm from "metabase/components/form/StandardForm";

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
