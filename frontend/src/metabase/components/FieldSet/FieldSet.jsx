/* eslint-disable react/prop-types */
import cx from "classnames";

export default function FieldSet({
  className = "border-brand",
  legend,
  noPadding,
  children,
}) {
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
        </legend>
      )}
      <div data-testid="field-set-content" className="w-full">
        {children}
      </div>
    </fieldset>
  );
}
