import { Link } from "react-router";

import { Button, FixedSizeIcon, Flex, type IconName } from "metabase/ui";

interface TabDef {
  label: string;
  to: string;
  icon: IconName;
}

interface BenchTabsProps {
  tabs: TabDef[];
}

export const BenchTabs = ({ tabs }: BenchTabsProps) => {
  return (
    <Flex gap="sm">
      {tabs.map(({ label, to, icon }) => (
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
          leftSection={
            <FixedSizeIcon
              name={icon}
              opacity={to === location.pathname ? 1 : 0.6}
            />
          }
        >
          {label}
        </Button>
      ))}
    </Flex>
  );
};
