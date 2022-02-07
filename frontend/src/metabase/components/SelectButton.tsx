import React, { forwardRef, useMemo, useCallback, HTMLAttributes } from "react";
import cx from "classnames";
import Icon from "metabase/components/Icon";

type Props = HTMLAttributes<HTMLDivElement> & {
  hasValue?: boolean;
  children: React.ReactNode;
  left?: React.ReactNode;
  onClear?: () => void;
};

const SelectButton = forwardRef<HTMLDivElement, Props>(function SelectButton(
  { className, children, left, hasValue, onClear, ...props }: Props,
  ref,
) {
  const handleClear = useCallback(
    event => {
      if (onClear) {
        // Required not to trigger the usual SelectButton's onClick handler
        event.stopPropagation();
        onClear();
      }
    },
    [onClear],
  );

  const rightIcon = useMemo(() => {
    if (hasValue && onClear) {
      return "close";
    }
    return "chevrondown";
  }, [hasValue, onClear]);

  return (
    <div
      {...props}
      className={cx(className, "AdminSelect flex align-center", {
        "text-medium": !hasValue,
      })}
      ref={ref}
    >
      {React.isValidElement(left) && left}
      <span className="AdminSelect-content mr1">{children}</span>
      <Icon
        className="AdminSelect-chevron flex-align-right"
        name={rightIcon}
        size={12}
        onClick={onClear ? handleClear : undefined}
      />
    </div>
  );
});

export default SelectButton;
