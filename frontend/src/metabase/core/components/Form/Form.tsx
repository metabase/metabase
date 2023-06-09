import {
  FormHTMLAttributes,
  forwardRef,
  Ref,
  SyntheticEvent,
  useEffect,
} from "react";
import { useFormikContext } from "formik";

export interface FormProps<Values>
  extends Omit<
    FormHTMLAttributes<HTMLFormElement>,
    "onSubmit" | "onReset" | "onChange"
  > {
  onChange?: (values: Values) => void;
  disabled?: boolean;
}

const Form = forwardRef(function Form<Values>(
  { disabled, onChange, ...props }: FormProps<Values>,
  ref: Ref<HTMLFormElement>,
) {
  const { handleSubmit, handleReset, values } = useFormikContext<Values>();

  useEffect(() => {
    onChange?.(values);
  }, [onChange, values]);

  return (
    <form
      {...props}
      ref={ref}
      onSubmit={!disabled ? handleSubmit : handleDisabledEvent}
      onReset={!disabled ? handleReset : handleDisabledEvent}
    />
  );
});

const handleDisabledEvent = (event: SyntheticEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Form;
