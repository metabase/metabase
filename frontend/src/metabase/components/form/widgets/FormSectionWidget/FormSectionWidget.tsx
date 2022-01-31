import React, { useCallback } from "react";
import { t } from "ttag";
import { WidgetButton } from "./FormSectionWidget.styled";
import { FormField } from "./types";

export interface FormSectionWidgetProps {
  field: FormField;
}

const FormSectionWidget = ({ field }: FormSectionWidgetProps): JSX.Element => {
  const handleClick = useCallback(() => {
    field.onChange(!field.value);
  }, [field]);

  return (
    <WidgetButton onClick={handleClick}>
      {field.value ? t`Hide advanced options` : t`Show advanced options`}
    </WidgetButton>
  );
};

export default FormSectionWidget;
