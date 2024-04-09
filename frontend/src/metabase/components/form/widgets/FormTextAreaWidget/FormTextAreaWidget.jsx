/* eslint-disable react/prop-types */
import cx from "classnames";

import FormS from "metabase/css/components/form.module.css";
import CS from "metabase/css/core/index.css";
import { formDomOnlyProps } from "metabase/lib/redux";

import { HelpText } from "./FormTextAreaWidget.styled";

const FormTextAreaWidget = ({
  placeholder,
  field,
  className,
  rows,
  autoFocus,
  helperText,
  tabIndex,
}) => (
  <>
    <textarea
      autoFocus={autoFocus}
      className={cx(className, FormS.FormInput, CS.full)}
      rows={rows}
      placeholder={placeholder}
      aria-labelledby={`${field.name}-label`}
      tabIndex={tabIndex}
      {...formDomOnlyProps(field)}
      value={field.value || ""}
    />
    {helperText && (
      <HelpText
        dangerouslySetInnerHTML={{
          __html: helperText,
        }}
      />
    )}
  </>
);

export default FormTextAreaWidget;
