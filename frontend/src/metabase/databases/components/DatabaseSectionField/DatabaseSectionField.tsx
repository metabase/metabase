import { useField } from "formik";
import { useCallback, useId } from "react";
import { t } from "ttag";

import { Group } from "metabase/ui";

import S from "./DatabaseSectionField.module.css";
import { SectionButton } from "./DatabaseSectionField.styled";

export interface DatabaseSectionFieldProps {
  name: string;
}

export const DatabaseSectionField = ({
  name,
}: DatabaseSectionFieldProps): JSX.Element => {
  const [{ value }, , { setValue }] = useField(name);

  const handleClick = useCallback(() => {
    setValue(!value);
  }, [value, setValue]);

  const buttonId = useId();
  const iconRight = value ? "chevronup" : "chevrondown";
  const buttonText = value ? t`Hide` : t`Show`;

  return (
    <Group className={S.FormField} justify="space-between" mb="md">
      <label
        htmlFor={buttonId}
        className={S.Label}
      >{t`Advanced options`}</label>
      <SectionButton
        type="button"
        iconRight={iconRight}
        onClick={handleClick}
        id={buttonId}
      >
        {buttonText}
      </SectionButton>
    </Group>
  );
};
