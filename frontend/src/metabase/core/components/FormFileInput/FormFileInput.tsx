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

export interface FormFileInputProps
  extends Omit<FileInputProps, "value" | "onChange" | "onBlur"> {
  name: string;
  title?: string;
  description?: ReactNode;
  optional?: boolean;
}

const FormFileInput = forwardRef(function FormFileInput(
  {
    name,
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
      setValue(await getFieldValue(event.target));
    },
    [setValue],
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
export default FormFileInput;
