import cx from "classnames";
import { Link } from "react-router";
import { t } from "ttag";

import { Box, Card, Flex, rem } from "metabase/ui";
import type { Transform } from "metabase-types/api";

import S from "./TransformItem.module.css";

type TransformItemProps = {
  transform: Transform;
  isActive: boolean;
};

export function TransformItem({ transform, isActive }: TransformItemProps) {
  return (
    <Card
      className={cx(S.card, {
        [S.active]: isActive,
      })}
      role="listitem"
      p={0}
      bg={isActive ? "brand-light" : "bg-white"}
      bd={isActive ? "1px solid brand" : "1px solid border"}
      withBorder
      aria-label={transform.name}
    >
      <Flex
        component={Link}
        to={`/admin/datamodel/transforms/${transform.id}`}
        direction="column"
        px="md"
        py={rem(12)}
        gap={rem(12)}
      >
        <Box fw="bold">{transform.name}</Box>
        <Box c={transform.description ? undefined : "text-medium"}>
          {transform.description ?? t`No description yet`}
        </Box>
      </Flex>
    </Card>
  );
}
