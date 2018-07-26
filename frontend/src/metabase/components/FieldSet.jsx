import React from "react";

import cx from "classnames";

type Props = {
  className: string,
  legend: string,
  noPadding?: boolean,
  children: React$Element<any>,
};

export default function FieldSet({
  className = "border-brand",
  legend,
  noPadding,
  children,
}: Props) {
  const fieldSetClassName = cx("bordered rounded", { "px2 pb2": !noPadding });

  return (
    <fieldset className={cx(className, fieldSetClassName)}>
      {legend && (
        <legend className="h5 text-bold text-uppercase px1 text-nowrap text-medium">
          {legend}
        </legend>
      )}
      <div>{children}</div>
    </fieldset>
  );
}
