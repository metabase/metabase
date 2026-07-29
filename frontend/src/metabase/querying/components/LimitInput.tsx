import cx from "classnames";
import { forwardRef } from "react";

import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";

const DEFAULT_STYLE = {
  borderWidth: 2,
};

interface LimitInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  small?: boolean;
  medium?: boolean;
}

export const LimitInput = forwardRef<HTMLInputElement, LimitInputProps>(
  function LimitInput({ className, small, medium, style = {}, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cx(CS.input, className, CS.bgWhite, {
          // HACK: reuse Button styles
          [ButtonsS.ButtonSmall]: small,
          [ButtonsS.ButtonMedium]: medium,
        })}
        style={{ ...DEFAULT_STYLE, ...style }}
        {...props}
      />
    );
  },
);
