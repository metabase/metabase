import React, {
  forwardRef,
  HTMLAttributes,
  ReactNode,
  Ref,
  useCallback,
  useContext,
  useMemo,
} from "react";
import TabContext, { TabContextType } from "../Tab/TabContext";
import { TabListRoot } from "./TabList.styled";

export interface TabListProps<T>
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  value?: T;
  onChange?: (value: T) => void;
  children?: ReactNode;
}

const TabList = forwardRef(function TabGroup<T>(
  { value, onChange, children, ...props }: TabListProps<T>,
  ref: Ref<HTMLDivElement>,
) {
  const { value: outerValue, onChange: onOuterChange } = useContext(TabContext);

  const handleChange = useCallback(
    (value: T) => {
      onChange?.(value);
      onOuterChange?.(value);
    },
    [onChange, onOuterChange],
  );

  const innerContext = useMemo(() => {
    return { value: value ?? outerValue, onChange: handleChange };
  }, [value, outerValue, handleChange]);

  return (
    <TabListRoot {...props} ref={ref} role="tablist">
      <TabContext.Provider value={innerContext as TabContextType}>
        {children}
      </TabContext.Provider>
    </TabListRoot>
  );
});

export default TabList;
