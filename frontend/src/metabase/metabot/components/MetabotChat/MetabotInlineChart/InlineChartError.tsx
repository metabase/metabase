import { useClipboard, useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useId } from "react";
import { t } from "ttag";

import { ErrorBox } from "metabase/common/components/ErrorDetails";
import {
  ActionIcon,
  Box,
  Button,
  Collapse,
  Flex,
  Icon,
  Text,
  Tooltip,
} from "metabase/ui";

import S from "./InlineChartError.module.css";
import type { ChartError } from "./utils";

/**
 * Compact error row that replaces the chart area when a Metabot chart's query
 * fails, with the database's own error behind a Details disclosure.
 */
export function InlineChartError({ error }: { error: ChartError }) {
  const [isExpanded, { toggle }] = useDisclosure(false);
  const clipboard = useClipboard();
  const detailsId = useId();

  return (
    <Box data-testid="metabot-inline-chart-error">
      <Flex align="flex-start" gap="sm">
        <Icon name={error.icon} c="error" flex="0 0 auto" mt="0.25rem" />
        <Text c="text-secondary" flex={1} miw={0}>
          {error.message}
        </Text>
        {error.details && (
          <Button
            variant="subtle"
            size="compact-sm"
            mt="0.25rem"
            rightSection={
              <Icon
                name="chevronright"
                size={12}
                aria-hidden
                className={cx(S.chevron, isExpanded && S.chevronOpen)}
              />
            }
            aria-expanded={isExpanded}
            aria-controls={detailsId}
            onClick={toggle}
          >
            {t`Details`}
          </Button>
        )}
      </Flex>
      {error.details && (
        <Collapse id={detailsId} in={isExpanded}>
          <Box pos="relative">
            <ErrorBox className={S.details} pr="3.5rem">
              {error.details}
            </ErrorBox>
            <Tooltip label={clipboard.copied ? t`Copied` : t`Copy error`}>
              <ActionIcon
                className={S.copyError}
                variant="subtle"
                aria-label={t`Copy error`}
                onClick={() => clipboard.copy(error.details)}
              >
                <Icon name="copy" size={16} />
              </ActionIcon>
            </Tooltip>
          </Box>
        </Collapse>
      )}
    </Box>
  );
}
