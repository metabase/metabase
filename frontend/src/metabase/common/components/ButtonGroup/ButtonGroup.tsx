import type { HTMLAttributes, ReactNode, Ref } from "react";
import { forwardRef } from "react";

import { ButtonGroupRoot } from "./ButtonGroup.styled";

export interface ButtonGroupProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

export const ButtonGroup = forwardRef(function ButtonGroup(
  { children, ...props }: ButtonGroupProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <ButtonGroupRoot {...props} ref={ref}>
      {children}
    </ButtonGroupRoot>
  );
});
