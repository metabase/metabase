import cx from "classnames";
import type { MouseEventHandler } from "react";
import { t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import {
  ActionIcon,
  Divider,
  Flex,
  Group,
  Icon,
  Paper,
  type PaperProps,
  Text,
} from "metabase/ui";
import type {
  ColumnFormattingSetting,
  DatasetColumn,
} from "metabase-types/api";

import { RuleBackground } from "./RuleBackground";
import { RuleDescription } from "./RuleDescription";

export const RulePreview = ({
  rule,
  cols,
  onClick,
  onRemove,
  ...paperProps
}: {
  rule: ColumnFormattingSetting;
  cols: DatasetColumn[];
  onClick: MouseEventHandler<HTMLDivElement>;
  onRemove: () => void;
} & PaperProps) => (
  <Paper
    withBorder
    className={CS.overflowHidden}
    onClick={onClick}
    data-testid="formatting-rule-preview"
    {...paperProps}
  >
    <Flex wrap="nowrap" px="md" align="center" bg="bg-light">
      <Text className={CS.flex1} fw="bold" fz="md">
        {rule.columns.length > 0 ? (
          rule.columns
            .map(name => _.findWhere(cols, { name })?.display_name ?? name)
            .join(", ")
        ) : (
          <Text fs="oblique">{t`No columns selected`}</Text>
        )}
      </Text>
      <ActionIcon
        onClick={e => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <Icon name="close" />
      </ActionIcon>
    </Flex>
    <Divider></Divider>
    <Group noWrap p="md" spacing="xs">
      <RuleBackground
        rule={rule}
        className={cx(CS.mr2, CS.flexNoShrink, CS.rounded, {
          [CS.bordered]: rule.type === "range",
        })}
        style={{ width: 40, height: 40 }}
      />
      <RuleDescription rule={rule} />
    </Group>
  </Paper>
);
