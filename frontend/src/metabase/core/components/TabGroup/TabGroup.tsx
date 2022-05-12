import React, { forwardRef, ReactNode, Ref, useMemo } from "react";
import TabGroupContext, { TabGroupContextType } from "./TabGroupContext";

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
    <div ref={ref}>
      <TabGroupContext.Provider value={context}>
        {children}
      </TabGroupContext.Provider>
    </div>
  );
});

export default TabGroup;
