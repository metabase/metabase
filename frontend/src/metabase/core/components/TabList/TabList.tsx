import React, {
  forwardRef,
  HTMLAttributes,
  ReactNode,
  Ref,
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
  const context = useMemo(() => {
    return { value, onChange } as TabContextType;
  }, [value, onChange]);

  return (
    <TabListRoot {...props} ref={ref} role="tablist">
      <TabContext.Provider value={context}>{children}</TabContext.Provider>
    </TabListRoot>
  );
});

export default TabList;
