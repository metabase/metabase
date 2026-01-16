import cx from "classnames";
import { t } from "ttag";

import { CopyButton } from "metabase/common/components/CopyButton";
import CS from "metabase/css/core/index.css";
import {
  ActionIcon,
  Badge,
  Box,
  Card,
  FixedSizeIcon,
  Group,
  Stack,
  Title,
  Tooltip,
} from "metabase/ui";
import type { DependencyError, DependencyErrorType } from "metabase-types/api";

import { TOOLTIP_OPEN_DELAY_MS } from "../../../../constants";
import { getDependencyErrorTypeLabel } from "../../../../utils";

import S from "./SidebarErrorInfo.module.css";

type SidebarErrorInfoProps = {
  type: DependencyErrorType;
  errors: DependencyError[];
};

export function SidebarErrorInfo({ type, errors }: SidebarErrorInfoProps) {
  const count = errors.length;
  const title = getDependencyErrorTypeLabel(type, count);
  const details = errors
    .map((error) => error.detail)
    .filter((detail) => detail != null);

  return (
    <Stack role="region" aria-label={title}>
      <Group gap="sm">
        <Badge c="text-selected" bg="error">
          {count}
        </Badge>
        <Title order={5}>{title}</Title>
      </Group>
      {details.length > 0 && (
        <Card p={0} shadow="none" withBorder>
          {details.map((detail, detailIndex) => (
            <ErrorItem key={detailIndex} detail={detail} />
          ))}
        </Card>
      )}
    </Stack>
  );
}

type ErrorItemProps = {
  detail: string;
};

function ErrorItem({ detail }: ErrorItemProps) {
  return (
    <Group
      className={cx(S.item, CS.hoverParent, CS.hoverVisibility)}
      p="md"
      justify="space-between"
      wrap="nowrap"
    >
      <Box className={cx(CS.textWrap, CS.textMonospace)} fz="sm" lh="1rem">
        {detail}
      </Box>
      <CopyButton
        className={CS.hoverChild}
        value={detail}
        target={
          <Tooltip label={t`Copy`} openDelay={TOOLTIP_OPEN_DELAY_MS}>
            <ActionIcon aria-label={t`Copy`}>
              <FixedSizeIcon name="copy" />
            </ActionIcon>
          </Tooltip>
        }
      />
    </Group>
  );
}
