import { ChangeEvent, FocusEvent } from "react";
import FileInput from "metabase/core/components/FileInput";
import { FormField, TreatBeforePosting } from "./types";

export interface FormTextFileWidgetProps {
  field: FormField;
  treatBeforePosting?: TreatBeforePosting;
}

const FormTextFileWidget = ({
  field,
  treatBeforePosting,
}: FormTextFileWidgetProps): JSX.Element => {
  const { name, autoFocus, onChange, onBlur } = field;

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    onChange(await getFieldValue(event.target, treatBeforePosting));
  };

  const handleBlur = async (event: FocusEvent<HTMLInputElement>) => {
    onBlur(await getFieldValue(event.target, treatBeforePosting));
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

const getFieldValue = (
  { files }: HTMLInputElement,
  treatBeforePosting?: TreatBeforePosting,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!files?.length) {
      resolve("");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject();

    if (treatBeforePosting === "base64") {
      reader.readAsDataURL(files[0]);
    } else {
      reader.readAsText(files[0]);
    }
  });
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormTextFileWidget;
