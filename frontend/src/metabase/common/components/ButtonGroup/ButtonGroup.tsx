import type { HTMLAttributes, Ref } from "react";
import { forwardRef } from "react";

import { ButtonGroupRoot } from "./ButtonGroup.styled";

export interface ButtonGroupProps extends HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

const ButtonGroup = forwardRef(function ButtonGroup(
  { children, ...props }: ButtonGroupProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <ButtonGroupRoot {...props} ref={ref}>
      {children}
    </ButtonGroupRoot>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ButtonGroup;
