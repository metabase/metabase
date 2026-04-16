import type { HTMLAttributes, ReactNode, Ref, UIEventHandler } from "react";
import { forwardRef, useContext, useMemo } from "react";

import { useUniqueId } from "metabase/common/hooks/use-unique-id";

import type { TabContextType } from "../Tab";
import { TabContext } from "../Tab";

import { TabListContent, TabListRoot } from "./TabList.styled";

export interface TabListProps<T>
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  value?: T;
  onChange?: (value: T) => void;
  onScroll?: UIEventHandler<HTMLDivElement>;
  children?: ReactNode;
}

const TabListInner = forwardRef(function TabGroup<T>(
  { value, onChange, onScroll, children, ...props }: TabListProps<T>,
  ref: Ref<HTMLDivElement>,
) {
  const idPrefix = useUniqueId();
  const outerContext = useContext(TabContext);

  const innerContext = useMemo(() => {
    return { value, idPrefix, onChange };
  }, [value, idPrefix, onChange]);

  const activeContext = outerContext.isDefault ? innerContext : outerContext;

  return (
    <TabListRoot {...props} role="tablist">
      <TabListContent ref={ref} onScroll={onScroll}>
        <TabContext.Provider value={activeContext as TabContextType}>
          {children}
        </TabContext.Provider>
      </TabListContent>
    </TabListRoot>
  );
});

export const TabList = Object.assign(TabListInner, {
  Root: TabListRoot,
  Content: TabListContent,
});
