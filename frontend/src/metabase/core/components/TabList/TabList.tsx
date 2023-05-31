import { forwardRef, HTMLAttributes, ReactNode, Ref, useContext, useMemo } from "react";
import * as React from "react";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import { TabContext, TabContextType } from "../Tab";
import { TabListContent, TabListRoot } from "./TabList.styled";

export interface TabListProps<T>
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  value?: T;
  onChange?: (value: T) => void;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
  children?: ReactNode;
}

const TabList = forwardRef(function TabGroup<T>(
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(TabList, {
  Root: TabListRoot,
  Content: TabListContent,
});
