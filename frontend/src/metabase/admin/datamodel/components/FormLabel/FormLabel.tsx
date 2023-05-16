import React, { forwardRef, HTMLAttributes, ReactNode, Ref } from "react";
import {
  FormLabelContent,
  FormLabelDescription,
  FormLabelRoot,
  FormLabelTitle,
} from "./FormLabel.styled";

interface FormLabelProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  children?: ReactNode;
}

const FormLabel = forwardRef(function FormLabel(
  { title, description, children, ...props }: FormLabelProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <FormLabelRoot {...props} ref={ref}>
      <FormLabelContent>
        {title && <FormLabelTitle>{title}</FormLabelTitle>}
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
