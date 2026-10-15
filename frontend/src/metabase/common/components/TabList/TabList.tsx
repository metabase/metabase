import type { HTMLAttributes, ReactNode, Ref, UIEventHandler } from "react";
import { forwardRef, useContext, useMemo } from "react";

import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { Box, Flex } from "metabase/ui";

import type { TabContextType } from "../Tab";
import { TabContext } from "../Tab";

import S from "./TabList.module.css";

export interface TabListProps<T> extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange"
> {
  value?: T;
  onChange?: (value: T) => void;
  onScroll?: UIEventHandler<HTMLDivElement>;
  children?: ReactNode;
}

export const TabList = forwardRef(function TabGroup<T>(
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
    <Box pos="relative" {...props} role="tablist">
      <Flex
        className={S.content}
        ref={ref}
        h="100%"
        align="end"
        onScroll={onScroll}
      >
        {/* Unjustified type cast. FIXME */}
        <TabContext.Provider value={activeContext as TabContextType}>
          {children}
        </TabContext.Provider>
      </Flex>
    </Box>
  );
});
