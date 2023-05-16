import React, { ChangeEvent, FocusEvent } from "react";
import FileInput from "metabase/core/components/FileInput";
import { FormField } from "./types";

export interface FormTextFileWidgetProps {
  field: FormField;
}

const FormTextFileWidget = ({
  field,
}: FormTextFileWidgetProps): JSX.Element => {
  const { name, autoFocus, onChange, onBlur } = field;

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    onChange(await getFieldValue(event.target));
  };

  const handleBlur = async (event: FocusEvent<HTMLInputElement>) => {
    onBlur(await getFieldValue(event.target));
  };

  return (
    <FileInput
      name={name}
      autoFocus={autoFocus}
      aria-labelledby={`${field.name}-label`}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
};

const getFieldValue = ({ files }: HTMLInputElement): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!files?.length) {
      resolve("");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject();
    reader.readAsDataURL(files[0]);
  });
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormTextFileWidget;
