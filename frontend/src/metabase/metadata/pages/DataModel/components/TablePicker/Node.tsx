import cx from "classnames";
import { type ReactNode, useState } from "react";
import { useMount } from "react-use";

import { Box, Flex, Icon, Skeleton } from "metabase/ui";

import S from "./Node.module.css";
import { getIconForType, hasChildren } from "./utils";

export function Node({
  type,
  name,
  expanded,
  onToggle,
  children,
}: {
  type: "database" | "schema" | "table";
  name: ReactNode;
  expanded?: boolean;
  onToggle?: () => void;
  children?: ReactNode;
}) {
  return (
    <Box my="md" className={S.node}>
      <Flex
        direction="row"
        align="center"
        gap="sm"
        onClick={onToggle}
        className={cx(S.title, { [S.clickable]: onToggle })}
      >
        {hasChildren(type) && (
          <Icon
            name="chevronright"
            size={10}
            className={cx(S.chevron, { [S.expanded]: expanded })}
            color="var(--mb-color-text-light)"
          />
        )}
        <Icon
          name={getIconForType(type)}
          color="var(--mb-color-text-placeholder)"
        />
        {name}
      </Flex>

      {expanded && <Box className={S.children}>{children}</Box>}
    </Box>
  );
}

export function LoadingNode({
  type,
}: {
  type: "database" | "schema" | "table";
}) {
  const w = 20 + Math.random() * 80;
  return (
    <Node
      type={type}
      name={<Skeleton height={10} width={`${w}%`} radius="sm" />}
    />
  );
}

export function Delay({
  delay = 100,
  children,
}: {
  delay?: number;
  children: ReactNode;
}) {
  const [show, setShow] = useState(false);

  useMount(() => {
    const timeout = setTimeout(() => {
      setShow(true);
    }, delay);
    return () => clearTimeout(timeout);
  });

  if (!show) {
    return null;
  }

  return children;
}
