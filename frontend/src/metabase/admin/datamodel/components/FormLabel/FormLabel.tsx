import type {
  HTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  Ref,
} from "react";
import { forwardRef } from "react";

import { Box } from "metabase/ui";

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
    <Box {...props} ref={ref} mb="xxl">
      <Box maw="36rem">
        {title && (
          <Box
            component="label"
            htmlFor={htmlFor}
            fz="sm"
            fw="bold"
            tt="uppercase"
            lts="0.06em"
          >
            {title}
          </Box>
        )}
        {description && (
          <Box component="p" mt="sm" mb="lg">
            {description}
          </Box>
        )}
      </Box>
      {children}
    </Box>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormLabel;
