import React from "react";
import cx from "classnames";
import Icon from "metabase/components/Icon";

type Props = {
  className?: string;
  style?: React.CSSProperties;
  hasValue?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
};

const SelectButton = ({
  className,
  style,
  children,
  hasValue = true,
  onClick,
}: Props) => (
  <div
    onClick={onClick}
    style={style}
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
