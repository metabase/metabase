import React, {
  forwardRef,
  HTMLAttributes,
  ReactNode,
  Ref,
  useContext,
  useMemo,
  useRef,
} from "react";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import { TabContext, TabContextType } from "../Tab";
import { TabListContent, TabListRoot } from "./TabList.styled";

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
  const idPrefix = useUniqueId();
  const outerContext = useContext(TabContext);

  const tabListContentRef = useRef(null);

  const innerContext = useMemo(() => {
    return { value, idPrefix, onChange };
  }, [value, idPrefix, onChange]);

  const activeContext = outerContext.isDefault ? innerContext : outerContext;

  return (
    <TabListRoot {...props} ref={ref} role="tablist">
      <TabListContent ref={tabListContentRef}>
        <TabContext.Provider value={activeContext as TabContextType}>
          {children}
        </TabContext.Provider>
      </TabListContent>
    </TabListRoot>
  );
});

export default Object.assign(TabList, {
  Root: TabListRoot,
  Content: TabListContent,
});
