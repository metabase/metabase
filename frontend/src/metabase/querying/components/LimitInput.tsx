import cx from "classnames";
import { forwardRef } from "react";

import CS from "metabase/css/core/index.css";

import S from "./LimitInput.module.css";

const DEFAULT_STYLE = {
  borderWidth: 2,
};

interface LimitInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  small?: boolean;
}

export const LimitInput = forwardRef<HTMLInputElement, LimitInputProps>(
  function LimitInput({ className, small, style = {}, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cx(CS.input, className, CS.bgWhite, { [S.small]: small })}
        style={{ ...DEFAULT_STYLE, ...style }}
        {...props}
      />
    );
  },
);
