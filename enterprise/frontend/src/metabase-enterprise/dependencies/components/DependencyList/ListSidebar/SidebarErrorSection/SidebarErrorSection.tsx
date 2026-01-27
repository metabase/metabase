import { useClipboard } from "@mantine/hooks";
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
import type { AnalysisFindingErrorType } from "metabase-types/api";

import type { DependencyError } from "../../../../types";
import { getErrorTypeLabel } from "../../../../utils";

import S from "./SidebarErrorSection.module.css";

type SidebarErrorSectionProps = {
  type: AnalysisFindingErrorType;
  errors: DependencyError[];
};

export function SidebarErrorSection({
  type,
  errors,
}: SidebarErrorSectionProps) {
  const count = errors.length;
  const title = getErrorTypeLabel(type, count);
  const details = errors
    .map((error) => error.detail)
    .filter((detail) => detail != null);

  return (
    <Stack role="region" aria-label={getErrorTypeLabel(type)}>
      <Group gap="sm" wrap="nowrap">
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
  const clipboard = useClipboard();

  const handleClick = () => {
    clipboard.copy(detail);
  };

  return (
    <Tooltip opened={clipboard.copied} label={t`Copied!`}>
      <Group
        className={cx(S.item, CS.hoverParent, CS.hoverVisibility)}
        p="md"
        justify="space-between"
        wrap="nowrap"
        onClick={handleClick}
      >
        <Box className={cx(CS.textWrap, CS.textMonospace)} fz="sm" lh="1rem">
          {detail}
        </Box>
        <CopyButton
          className={CS.hoverChild}
          value={detail}
          target={
            <ActionIcon aria-label={t`Copy`}>
              <FixedSizeIcon name="copy" />
            </ActionIcon>
          }
        />
      </Group>
    </Tooltip>
  );
}
