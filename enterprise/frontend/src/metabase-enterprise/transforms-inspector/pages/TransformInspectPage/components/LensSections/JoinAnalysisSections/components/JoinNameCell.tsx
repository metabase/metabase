import { match } from "ts-pattern";
import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { FixedSizeIcon, Group, Tooltip } from "metabase/ui";

type JoinNameCellProps = {
  joinAlias: string;
  joinStrategy: string;
};

export const JoinNameCell = ({
  joinAlias,
  joinStrategy,
}: JoinNameCellProps) => (
  <Group gap="sm" wrap="nowrap" miw={0}>
    <Tooltip
      label={match(joinStrategy)
        .with("left-join", () => t`Left Join`)
        .with("right-join", () => t`Right Join`)
        .with("inner-join", () => t`Inner Join`)
        .with("full-join", () => t`Full Join`)
        .otherwise(() => joinStrategy)}
    >
      <FixedSizeIcon
        name={match(joinStrategy)
          .with("left-join", () => "join_left_outer" as const)
          .with("right-join", () => "join_right_outer" as const)
          .with("inner-join", () => "join_inner" as const)
          .with("full-join", () => "join_full_outer" as const)
          .otherwise(() => "join_left_outer" as const)}
        c="brand"
      />
    </Tooltip>
    <Ellipsified>{joinAlias}</Ellipsified>
  </Group>
);
