import type {
  HTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  Ref,
} from "react";
import { forwardRef } from "react";

import {
  FormLabelContent,
  FormLabelDescription,
  FormLabelRoot,
  FormLabelTitle,
} from "./FormLabel.styled";

interface FormLabelProps extends HTMLAttributes<HTMLDivElement> {
  htmlFor?: LabelHTMLAttributes<HTMLLabelElement>["htmlFor"];
  title?: string;
  description?: string;
  children?: ReactNode;
}

const FormLabel = forwardRef(function FormLabel(
  { htmlFor, title, description, children, ...props }: FormLabelProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <FormLabelRoot {...props} ref={ref}>
      <FormLabelContent>
        {title && <FormLabelTitle htmlFor={htmlFor}>{title}</FormLabelTitle>}
        {description && (
          <FormLabelDescription>{description}</FormLabelDescription>
        )}
      </FormLabelContent>
      {children}
    </FormLabelRoot>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormLabel;
