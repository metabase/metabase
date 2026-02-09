import cx from "classnames";
import type { MouseEventHandler } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import {
  ActionIcon,
  Divider,
  Group,
  Icon,
  Paper,
  type PaperProps,
  Text,
} from "metabase/ui";

import { RuleBackground } from "./RuleBackground";
import { RuleDescription } from "./RuleDescription";
import type { NumberFormattingSetting } from "./types";

export const RulePreview = ({
  rule,
  onClick,
  onRemove,
  ...paperProps
}: {
  rule: NumberFormattingSetting;
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
    <Group wrap="nowrap" px="md" bg="background-secondary">
      <Text flex="1" fw="bold" fz="md">
        {rule.type === "single" ? t`Conditional color` : t`Color range`}
      </Text>
      <ActionIcon
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <Icon name="close" />
      </ActionIcon>
    </Group>
    <Divider></Divider>
    <Group wrap="nowrap" p="md" gap="xs">
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
