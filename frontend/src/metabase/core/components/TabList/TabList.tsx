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
  const outerContext = useContext(TabContext);
  const innerContext = useMemo(() => ({ value, onChange }), [value, onChange]);
  const activeContext = outerContext.isDefault ? innerContext : outerContext;

  return (
    <TabListRoot {...props} ref={ref} role="tablist">
      <TabContext.Provider value={activeContext as TabContextType}>
        {children}
      </TabContext.Provider>
    </TabListRoot>
  );
});

export default TabList;
