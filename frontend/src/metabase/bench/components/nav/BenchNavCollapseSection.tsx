import { useDisclosure } from "@mantine/hooks";
import type { ReactNode } from "react";

import CS from "metabase/css/core/index.css";
import { Collapse, Group, Icon, Text, UnstyledButton } from "metabase/ui";

type BenchNavCollapseSectionProps = {
  title: ReactNode;
  children: ReactNode;
};

export const BenchNavCollapseSection = ({
  title,
  children,
}: BenchNavCollapseSectionProps) => {
  const [opened, { toggle }] = useDisclosure(true);

  return (
    <>
      <Group
        className={CS.cursorPointer}
        component={UnstyledButton}
        align="center"
        justify="space-between"
        p="1.5rem 0.5rem 0.75rem"
        onClick={toggle}
      >
        <Text size="sm" c="var(--mb-color-text-secondary)">
          {title}
        </Text>
        <Icon name={opened ? "chevrondown" : "chevronright"} size={8} />
      </Group>
      <Collapse
        in={opened}
        transitionDuration={0}
        role="tabpanel"
        aria-expanded={opened}
      >
        {children}
      </Collapse>
    </>
  );
};
