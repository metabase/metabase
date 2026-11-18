import { useField } from "formik";
import type { ChangeEvent, ReactNode, Ref } from "react";
import { forwardRef, useCallback } from "react";

import type { FileInputProps } from "metabase/common/components/FileInput";
import { FileInput } from "metabase/common/components/FileInput";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { FormField, type FormFieldProps } from "metabase/forms";

export type FormFileInputEncoding = "base64";

export interface FormFileInputProps
  extends
    Omit<FileInputProps, "value" | "onChange" | "onBlur">,
    Pick<FormFieldProps, "mb" | "gap"> {
  name: string;
  encoding?: FormFileInputEncoding;
  title?: string;
  description?: ReactNode;
  optional?: boolean;
}

export const FormFileInput = forwardRef(function FormFileInput(
  {
    name,
    encoding,
    className,
    style,
    mb,
    gap,
    title,
    description,
    optional,
    ...props
  }: FormFileInputProps,
  ref: Ref<HTMLDivElement>,
) {
  const id = useUniqueId();
  const [{ onBlur }, { error, touched }, { setValue }] = useField(name);

  const handleChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      setValue(await getFieldValue(event.target, encoding));
    },
    [encoding, setValue],
  );

  return (
    <FormField
      ref={ref}
      className={className}
      style={style}
      mb={mb}
      gap={gap}
      title={title}
      description={description}
      htmlFor={id}
      error={touched ? error : undefined}
      optional={optional}
    >
      <FileInput
        {...props}
        id={id}
        name={name}
        onChange={handleChange}
        onBlur={onBlur}
      />
    </FormField>
  );
});

const getFieldValue = (
  { files }: HTMLInputElement,
  encoding?: FormFileInputEncoding,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!files?.length) {
      resolve("");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject();

    if (encoding === "base64") {
      reader.readAsDataURL(files[0]);
    } else {
      reader.readAsText(files[0]);
    }
  });
};
