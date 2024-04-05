/* eslint-disable react/prop-types */
import cx from "classnames";

import NumericInput from "metabase/components/NumericInput";
import FormS from "metabase/css/components/form.module.css";
import CS from "metabase/css/core/index.css";
import { formDomOnlyProps } from "metabase/lib/redux";

const FormInputWidget = ({ placeholder, field }) => (
  <NumericInput
    className={cx(FormS.FormInput, CS.full)}
    placeholder={placeholder}
    aria-labelledby={`${field.name}-label`}
    {...formDomOnlyProps(field)}
  />
);

export default FormInputWidget;
