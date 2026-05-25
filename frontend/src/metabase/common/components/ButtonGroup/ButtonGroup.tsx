import cx from "classnames";
import type { HTMLAttributes, ReactNode, Ref } from "react";
import { forwardRef } from "react";

import S from "./ButtonGroup.module.css";

export interface ButtonGroupProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

export const ButtonGroup = forwardRef(function ButtonGroup(
  { children, className, ...props }: ButtonGroupProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <div {...props} ref={ref} className={cx(S.root, className)}>
      {children}
    </div>
  );
});
