import React from "react";
import cx from "classnames";
import Icon from "metabase/components/Icon";

type Props = {
  className?: string;
  hasValue?: boolean;
  children: React.ReactNode;
};

const SelectButton = ({
  className,
  children,
  hasValue = true,
  ...props
}: Props) => (
  <div
    {...props}
    className={cx(className, "AdminSelect flex align-center", {
      "text-medium": !hasValue,
    })}
  >
    <span className="AdminSelect-content mr1">{children}</span>
    <Icon
      className="AdminSelect-chevron flex-align-right"
      name="chevrondown"
      size={12}
    />
  </div>
);

export default SelectButton;
