import cx from "classnames";
import type * as React from "react";

import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";

const DEFAULT_STYLE = {
  borderWidth: 2,
};

interface LimitInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  small?: boolean;
  medium?: boolean;
}

const LimitInput = ({
  className,
  small,
  medium,
  style = {},
  ...props
}: LimitInputProps) => (
  <input
    className={cx(CS.input, className, {
      // HACK: reuse Button styles
      [ButtonsS.ButtonSmall]: small,
      [ButtonsS.ButtonMedium]: medium,
    })}
    style={{ ...DEFAULT_STYLE, ...style }}
    {...props}
  />
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default LimitInput;
