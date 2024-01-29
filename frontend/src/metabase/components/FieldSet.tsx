import cx from "classnames";
import type { ReactNode } from "react";

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
          className="h5 text-bold text-uppercase px1 text-nowrap text-medium"
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
