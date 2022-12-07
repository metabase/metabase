import React, {
  forwardRef,
  HTMLAttributes,
  ReactNode,
  Ref,
  useContext,
  useMemo,
  useState,
  useEffect,
  useRef,
} from "react";
import Icon from "metabase/components/Icon";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import { TabContext, TabContextType } from "../Tab";
import { TabListContent, TabListRoot } from "./TabList.styled";

const UNDERSCROLL_PIXELS = 32;

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

export default TabList;
