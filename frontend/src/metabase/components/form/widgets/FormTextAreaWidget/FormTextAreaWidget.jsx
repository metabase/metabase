/* eslint-disable react/prop-types */
import cx from "classnames";

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
      className={cx(className, "Form-input full")}
      rows={rows}
      placeholder={placeholder}
      aria-labelledby={`${field.name}-label`}
      tabIndex={tabIndex}
      {...formDomOnlyProps(field)}
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
