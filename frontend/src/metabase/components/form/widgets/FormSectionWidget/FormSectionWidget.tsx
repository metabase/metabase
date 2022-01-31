import React, { useCallback } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button";

export interface FormSectionWidgetProps {
  field: any;
}

const FormSectionWidget = ({ field }: FormSectionWidgetProps): JSX.Element => {
  const handleClick = useCallback(() => {
    field.onChange(!field.value);
  }, [field]);

  return (
    <Button onClick={handleClick}>
      {field.value ? t`Hide advanced options` : t`Show advanced options`}
    </Button>
  );
};

export default FormSectionWidget;
