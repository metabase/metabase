import cx from "classnames";
import type { ReactNode } from "react";

import CS from "metabase/css/core/index.css";

interface FieldSetProps {
  className?: string;
  legend?: string;
  required?: boolean;
  noPadding?: boolean;
  children: ReactNode;
}

export function FieldSet({
  className = "border-brand",
  legend,
  required = false,
  noPadding = false,
  children,
}: FieldSetProps) {
  const fieldSetClassName = cx("bordered rounded", { "px2 pb2": !noPadding });

  return (
    <fieldset
      data-testid="field-set"
      className={cx(className, fieldSetClassName)}
    >
      {legend && (
        <legend
          data-testid="field-set-legend"
          className={cx(
            CS.h5,
            CS.textBold,
            CS.textUppercase,
            CS.px1,
            CS.textNoWrap,
            CS.textMedium,
          )}
        >
          {legend}
          {required && <span>&nbsp;*</span>}
        </legend>
      )}
      <div data-testid="field-set-content" className="w-full">
        {children}
      </div>
    </fieldset>
  );
}
