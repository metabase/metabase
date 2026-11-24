import { useField } from "formik";
import type { ReactNode, Ref } from "react";
import { forwardRef, useCallback } from "react";
import { t } from "ttag";

import { FileInput, type FileInputProps, Icon } from "metabase/ui";

export type FormFileInputEncoding = "base64";

export interface FormFileInputProps extends Omit<
  FileInputProps<false>,
  "value" | "onChange" | "onBlur" | "placeholder"
> {
  name: string;
  encoding?: FormFileInputEncoding;
  title?: string;
  description?: ReactNode;
}

export const FormFileInput = forwardRef(function FormFileInput(
  { name, encoding, title, ...props }: FormFileInputProps,
  ref: Ref<HTMLButtonElement>,
) {
  const [, { error, touched }, { setValue, setTouched }] = useField(name);

  const handleChange = useCallback(
    async (file: File | null) => {
      setValue(await getFieldValue(file, encoding));
    },
    [encoding, setValue],
  );

  return (
    <FileInput
      {...props}
      ref={ref}
      name={name}
      label={title}
      // the database form passes placeholders meant for text fields ("/path/to/keystore")
      placeholder={t`Select a file`}
      leftSection={<Icon name="upload" />}
      error={touched ? error : undefined}
      errorProps={{ role: "alert" }}
      onChange={handleChange}
      onBlur={() => setTouched(true)}
      fileInputProps={{
        "aria-label": title ? t`${title} file input` : t`File input`,
      }}
    />
  );
});

const getFieldValue = (
  file: File | null,
  encoding?: FormFileInputEncoding,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (file == null) {
      resolve("");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject();

    if (encoding === "base64") {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  });
};
