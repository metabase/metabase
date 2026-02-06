import { match } from "ts-pattern";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Flex, Icon, Tooltip } from "metabase/ui";

type JoinNameCellProps = {
  joinAlias: string;
  joinStrategy: string;
};

export const JoinNameCell = ({
  joinAlias,
  joinStrategy,
}: JoinNameCellProps) => (
  <Flex align="center" gap="sm">
    <Tooltip
      label={match(joinStrategy)
        .with("left-join", () => "Left Join")
        .with("right-join", () => "Right Join")
        .with("inner-join", () => "Inner Join")
        .with("full-join", () => "Full Join")
        .otherwise(() => joinStrategy)}
    >
      <Icon
        name={match(joinStrategy)
          .with("left-join", () => "join_left_outer" as const)
          .with("right-join", () => "join_right_outer" as const)
          .with("inner-join", () => "join_inner" as const)
          .with("full-join", () => "join_full_outer" as const)
          .otherwise(() => "join_left_outer")}
        c="brand"
      />
    </Tooltip>
    <Ellipsified>{joinAlias}</Ellipsified>
  </Flex>
);
