import { useFormikContext } from "formik";
import type { ElementType, Ref, SyntheticEvent } from "react";
import { forwardRef } from "react";

import { Box } from "metabase/ui";

export type FormProps<C extends ElementType> = {
  as?: C;
  disabled?: boolean;
  component?: string;
} & Omit<React.ComponentPropsWithRef<C>, "as" | "disabled" | "component">;

export const Form = forwardRef(function Form<
  C extends ElementType = typeof Box,
>({ as, disabled, component = "form", ...props }: FormProps<C>, ref: Ref<any>) {
  const { handleSubmit, handleReset } = useFormikContext();
  const Component = as || Box;

  return (
    <Component
      {...props}
      ref={ref}
      component={component}
      onSubmit={!disabled ? handleSubmit : handleDisabledEvent}
      onReset={!disabled ? handleReset : handleDisabledEvent}
    />
  );
});

const handleDisabledEvent = (event: SyntheticEvent) => {
  event.preventDefault();
  event.stopPropagation();
};
