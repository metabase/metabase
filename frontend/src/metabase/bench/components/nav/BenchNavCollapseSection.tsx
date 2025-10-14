import { useDisclosure } from "@mantine/hooks";
import type { ReactNode } from "react";
import { useCallback } from "react";

import CS from "metabase/css/core/index.css";
import { Collapse, Group, Icon, Text, UnstyledButton } from "metabase/ui";

type BenchNavCollapseSectionProps = {
  title: ReactNode;
  slug: string;
  children: ReactNode;
};

export const BenchNavCollapseSection = ({
  title,
  slug,
  children,
}: BenchNavCollapseSectionProps) => {
  const [opened, { toggle }] = useDisclosure(getInitialState(slug));

  const handleToggle = useCallback(() => {
    const newValue = !opened;

    toggle();

    localStorage.setItem(getItemKey(slug), newValue.toString());
  }, [opened, slug, toggle]);

  return (
    <>
      <Group
        className={CS.cursorPointer}
        component={UnstyledButton}
        align="center"
        justify="space-between"
        p="1.5rem 0.5rem 0.75rem"
        onClick={handleToggle}
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

function getItemKey(slug: string) {
  return `metabase-bench-nav-section-${slug}-expanded`;
}

function getInitialState(slug: string) {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(getItemKey(slug));
    if (saved === "false") {
      return false;
    }
  }

  return true;
}
