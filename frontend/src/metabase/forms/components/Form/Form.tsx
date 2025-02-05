import { useFormikContext } from "formik";
import type { ElementType, FormHTMLAttributes, SyntheticEvent } from "react";
import { forwardRef } from "react";

import type { BoxProps } from "metabase/ui";
import { Box } from "metabase/ui";

type PolymorphicComponentProp<C extends ElementType, P> = {
  as?: C;
} & Omit<React.ComponentPropsWithRef<C>, keyof P> &
  P;

export type FormProps<C extends ElementType = typeof Box> =
  PolymorphicComponentProp<
    C,
    BoxProps &
      FormHTMLAttributes<HTMLFormElement> & {
        disabled?: boolean;
      }
  >;

export const Form = forwardRef(function Form<
  C extends ElementType = typeof Box,
>(
  { as, disabled, ...props }: FormProps<C>,
  ref: React.ComponentPropsWithRef<C>["ref"],
) {
  const { handleSubmit, handleReset } = useFormikContext();
  const Component = as || Box;

  return (
    <Component
      {...props}
      ref={ref}
      component="form"
      onSubmit={!disabled ? handleSubmit : handleDisabledEvent}
      onReset={!disabled ? handleReset : handleDisabledEvent}
    />
  );
});

const handleDisabledEvent = (event: SyntheticEvent) => {
  event.preventDefault();
  event.stopPropagation();
};
