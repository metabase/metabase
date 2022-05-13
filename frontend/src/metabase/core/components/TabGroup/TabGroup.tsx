import React, { forwardRef, ReactNode, Ref, useMemo } from "react";
import TabGroupContext, { TabGroupContextType } from "./TabGroupContext";
import { TabGroupRoot } from "./TabGroup.styled";

export interface TabGroupProps<T> {
  value?: T;
  onChange?: (value: T) => void;
  children?: ReactNode;
}

const TabGroup = forwardRef(function TabGroup<T>(
  { value, onChange, children }: TabGroupProps<T>,
  ref: Ref<HTMLDivElement>,
) {
  const context = useMemo(() => {
    return { value, onChange } as TabGroupContextType;
  }, [value, onChange]);

  return (
    <TabGroupRoot ref={ref} role="tablist">
      <TabGroupContext.Provider value={context}>
        {children}
      </TabGroupContext.Provider>
    </TabGroupRoot>
  );
});

export default TabGroup;
