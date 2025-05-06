import cx from "classnames";
import { type ReactNode, useState } from "react";
import { useMount } from "react-use";

import Link from "metabase/core/components/Link";
import { Box, Flex, Icon, Skeleton } from "metabase/ui";

import S from "./Node.module.css";
import { getIconForType, hasChildren } from "./utils";

export function Node({
  type,
  name,
  expanded,
  onToggle,
  href,
  children,
}: {
  type: "database" | "schema" | "table";
  name: ReactNode;
  expanded?: boolean;
  onToggle?: () => void;
  href?: string;
  children?: ReactNode[];
}) {
  return (
    <Box my="md" className={S.node}>
      <MaybeLink to={!expanded && href} onClick={onToggle}>
        <Flex
          direction="row"
          align="center"
          gap="sm"
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
      </MaybeLink>

      {expanded && <Box className={S.children}>{children}</Box>}
    </Box>
  );
}

function MaybeLink(props: {
  to?: string | boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  const { to, ...rest } = props;
  if (typeof to === "string") {
    return <Link {...props} to={to} />;
  }
  return <span {...rest} />;
}

export function LoadingNode({
  type,
}: {
  type: "database" | "schema" | "table";
}) {
  const w = 20 + Math.random() * 80;
  return (
    <Delay>
      <Node
        type={type}
        name={<Skeleton height={10} width={`${w}%`} radius="sm" />}
      />
    </Delay>
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

export function renderLoading(count: number = 3) {
  return Array(count)
    .fill(null)
    .map((_, index) => <LoadingNode key={index} type="table" />);
}
