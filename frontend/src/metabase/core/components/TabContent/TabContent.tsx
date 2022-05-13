import React, {
  forwardRef,
  HTMLAttributes,
  ReactNode,
  Ref,
  useMemo,
} from "react";
import { TabContext, TabContextType } from "../Tab";

export interface TabContentProps<T>
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  value?: T;
  children?: ReactNode;
  onChange?: (value: T) => void;
}

const TabContent = forwardRef(function TabContent<T>(
  { value, children, onChange, ...props }: TabContentProps<T>,
  ref: Ref<HTMLDivElement>,
) {
  const context = useMemo(() => ({ value, onChange }), [value, onChange]);

  return (
    <div {...props} ref={ref}>
      <TabContext.Provider value={context as TabContextType}>
        {children}
      </TabContext.Provider>
    </div>
  );
});

export default TabContent;
