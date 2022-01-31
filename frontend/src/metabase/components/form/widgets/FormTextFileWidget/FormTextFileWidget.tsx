import React, { ChangeEvent, FocusEvent } from "react";
import cx from "classnames";
import { formDomOnlyProps } from "metabase/lib/redux";
import { FormField, TreatBeforePosting } from "./types";

export interface FormTextFileWidgetProps {
  field: FormField;
  treatBeforePosting?: TreatBeforePosting;
}

const FormTextFileWidget = ({
  field,
  treatBeforePosting,
}: FormTextFileWidgetProps): JSX.Element => {
  const { value, ...otherProps } = formDomOnlyProps(field as any);

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    field.onChange(await getFieldValue(event.target, treatBeforePosting));
  };

  const handleBlur = async (event: FocusEvent<HTMLInputElement>) => {
    field.onBlur(await getFieldValue(event.target, treatBeforePosting));
  };

  return (
    <input
      type="file"
      className={cx(
        { "Form-file-input--has-value": value },
        "Form-file-input full",
      )}
      aria-labelledby={`${field.name}-label`}
      {...otherProps}
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
    if (!files || !files?.length) {
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

export default FormTextFileWidget;
