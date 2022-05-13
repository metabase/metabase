import React, {
  forwardRef,
  HTMLAttributes,
  MouseEvent,
  ReactNode,
  Ref,
  useCallback,
  useContext,
} from "react";
import TabGroupContext from "metabase/core/components/TabGroup/TabGroupContext";
import { TabIcon, TabLabel, TabRoot } from "./Tab.styled";

export interface TabProps<T> extends HTMLAttributes<HTMLButtonElement> {
  value?: T;
  icon?: string;
  isSelected?: boolean;
  children?: ReactNode;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}

const Tab = forwardRef(function Tab<T>(
  { value, icon, isSelected, children, onClick, ...props }: TabProps<T>,
  ref: Ref<HTMLButtonElement>,
) {
  const { value: groupValue, onChange } = useContext(TabGroupContext);
  const isSelectedInGroup = value === groupValue;

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      onChange?.(value);
    },
    [value, onClick, onChange],
  );

  return (
    <TabRoot
      {...props}
      ref={ref}
      isSelected={isSelected || isSelectedInGroup}
      onClick={handleClick}
    >
      {icon && <TabIcon name={icon} />}
      <TabLabel>{children}</TabLabel>
    </TabRoot>
  );
});

export default Tab;
