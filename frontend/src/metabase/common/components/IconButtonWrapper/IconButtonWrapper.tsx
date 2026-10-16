import cx from "classnames";
import { type ButtonHTMLAttributes, forwardRef } from "react";

import S from "./IconButtonWrapper.module.css";

type IconButtonWrapperProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  circle?: boolean;
};

export const IconButtonWrapper = forwardRef<
  HTMLButtonElement,
  IconButtonWrapperProps
>(function IconButtonWrapper(
  { circle, type = "button", className, ...props },
  ref,
) {
  return (
    <button
      {...props}
      type={type}
      ref={ref}
      className={cx(S.root, { [S.circle]: circle }, className)}
    />
  );
});
