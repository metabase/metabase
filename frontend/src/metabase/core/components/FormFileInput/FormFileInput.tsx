import React, {
  ChangeEvent,
  forwardRef,
  ReactNode,
  Ref,
  useCallback,
} from "react";
import { useField } from "formik";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import FileInput, { FileInputProps } from "metabase/core/components/FileInput";
import FormField from "metabase/core/components/FormField";

export type FormFileInputEncoding = "base64";

export interface FormFileInputProps
  extends Omit<FileInputProps, "value" | "onChange" | "onBlur"> {
  name: string;
  encoding?: FormFileInputEncoding;
  title?: string;
  description?: ReactNode;
}

const FormFileInput = forwardRef(function FormFileInput(
  {
    name,
    encoding,
    className,
    style,
    title,
    description,
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
      orientation="horizontal"
      htmlFor={id}
      error={touched ? error : undefined}
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

export default FormFileInput;
