import { useField } from "formik";
import type { ChangeEvent, ReactNode, Ref } from "react";
import { forwardRef, useCallback } from "react";

import type { FileInputProps } from "metabase/core/components/FileInput";
import FileInput from "metabase/core/components/FileInput";
import FormField from "metabase/core/components/FormField";
import { useUniqueId } from "metabase/hooks/use-unique-id";

export type FormFileInputEncoding = "base64";

export interface FormFileInputProps
  extends Omit<FileInputProps, "value" | "onChange" | "onBlur"> {
  name: string;
  encoding?: FormFileInputEncoding;
  title?: string;
  description?: ReactNode;
  optional?: boolean;
}

const FormFileInput = forwardRef(function FormFileInput(
  {
    name,
    encoding,
    className,
    style,
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormFileInput;
