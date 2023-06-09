import { ReactNode, useMemo } from "react";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import { TabContext, TabContextType } from "../Tab";

export interface TabContentProps<T> {
  value?: T;
  children?: ReactNode;
  onChange?: (value: T) => void;
}

const TabContent = function TabContent<T>({
  value,
  children,
  onChange,
}: TabContentProps<T>) {
  const idPrefix = useUniqueId();
  const context = useMemo(() => {
    return { value, idPrefix, onChange };
  }, [value, idPrefix, onChange]);

  return (
    <TabContext.Provider value={context as TabContextType}>
      {children}
    </TabContext.Provider>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TabContent;
