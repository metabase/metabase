import { useCallback } from "react";
import { t } from "ttag";
import { WidgetButton } from "./FormSectionWidget.styled";
import { FormField } from "./types";

export interface FormSectionWidgetProps {
  field: FormField;
}

const FormSectionWidget = ({ field }: FormSectionWidgetProps): JSX.Element => {
  const { value, onChange } = field;

  const handleClick = useCallback(() => {
    onChange(!value);
  }, [value, onChange]);

  return (
    <WidgetButton
      type="button"
      iconRight={value ? "chevronup" : "chevrondown"}
      onClick={handleClick}
    >
      {value ? t`Hide advanced options` : t`Show advanced options`}
    </WidgetButton>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormSectionWidget;
