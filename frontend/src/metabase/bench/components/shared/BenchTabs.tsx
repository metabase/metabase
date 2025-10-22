import { Link } from "react-router";

import { Button, Flex } from "metabase/ui";

interface TabDef {
  label: string;
  to: string;
}

interface BenchTabsProps {
  tabs: TabDef[];
}

export const BenchTabs = ({ tabs }: BenchTabsProps) => {
  return (
    <Flex gap="sm">
      {tabs.map(({ label, to }) => (
        <Button
          key={label}
          component={Link}
          to={to}
          size="sm"
          radius="xl"
          bd="none"
          {...(to === location.pathname && {
            c: "brand",
            bg: "brand-light",
          })}
        >
          {label}
        </Button>
      ))}
    </Flex>
  );
};
