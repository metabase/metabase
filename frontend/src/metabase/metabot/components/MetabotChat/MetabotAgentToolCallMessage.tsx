import { useClipboard, useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { t } from "ttag";

import { CodeEditor } from "metabase/common/components/CodeEditor";
import type { MetabotDebugToolCallMessage } from "metabase/metabot/state";
import { parseToolCallResult } from "metabase/metabot/utils/tool-call-result";
import {
  ActionIcon,
  Badge,
  Box,
  Flex,
  Icon,
  Modal,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";

import Styles from "./MetabotChat.module.css";

export const ToolCallTitle = ({
  message,
}: {
  message: MetabotDebugToolCallMessage;
}) => (
  <Flex align="center" gap="sm">
    {t`Tool Call: ${message.name}`}
    <Badge color="brand" size="sm" variant="light">
      {message.id}
    </Badge>
  </Flex>
);

const ToolCallSection = ({
  title,
  value,
  isJson = true,
  copyLabel,
  badge,
}: {
  title: string;
  value: string;
  isJson?: boolean;
  copyLabel: string;
  badge?: ReactNode;
}) => {
  const clipboard = useClipboard();

  return (
    <Stack gap="xs">
      <Flex gap="xs">
        <Flex align="center" gap="sm">
          <Text fw="bold">{title}</Text>
          {badge}
        </Flex>
        <Tooltip label={clipboard.copied ? t`Copied!` : t`Copy`}>
          <ActionIcon
            h="sm"
            aria-label={copyLabel}
            onClick={() => clipboard.copy(value)}
          >
            <Icon name="copy" size="1rem" />
          </ActionIcon>
        </Tooltip>
      </Flex>
      <Box p="xs" bd="1px solid var(--mb-color-border-neutral)" bdrs="sm">
        <CodeEditor
          value={value}
          language={isJson ? "json" : undefined}
          lineNumbers={isJson}
          readOnly
        />
      </Box>
    </Stack>
  );
};

export const ToolCallDetailsContent = ({
  message,
}: {
  message: MetabotDebugToolCallMessage;
}) => {
  const parsedArgs = useMemo(() => {
    try {
      return message.args
        ? // done for formatting
          JSON.stringify(JSON.parse(message.args), null, 2)
        : "{}";
    } catch {
      console.warn("Failed to parse tool call args as JSON", message.args);
      return message.args ?? "{}";
    }
  }, [message.args]);

  const { output, structuredOutput, extra } = useMemo(
    () => parseToolCallResult(message.result),
    [message.result],
  );

  return (
    <Stack gap="md">
      {message.args && (
        <ToolCallSection
          title={t`Request`}
          value={parsedArgs}
          copyLabel={t`Copy request JSON`}
        />
      )}

      {output && (
        <ToolCallSection
          title={t`Response`}
          value={output}
          isJson={false}
          copyLabel={t`Copy response`}
          badge={
            message.is_error && (
              <Badge color="negative" size="sm">
                {t`Errored`}
              </Badge>
            )
          }
        />
      )}

      {structuredOutput && (
        <ToolCallSection
          title={t`Structured output`}
          value={structuredOutput}
          copyLabel={t`Copy structured output`}
        />
      )}

      {extra && (
        <ToolCallSection
          title={t`Other fields`}
          value={extra}
          copyLabel={t`Copy other fields`}
        />
      )}
    </Stack>
  );
};

const ToolCallDetailsModal = ({
  message,
  onClose,
}: {
  message: MetabotDebugToolCallMessage;
  onClose: () => void;
}) => (
  <Modal
    opened
    onClose={onClose}
    size="lg"
    title={<ToolCallTitle message={message} />}
    data-testid="tool-call-details-modal"
  >
    <ToolCallDetailsContent message={message} />
  </Modal>
);

export const AgentToolCallMessage = ({
  message,
  onSelect,
}: {
  message: MetabotDebugToolCallMessage;
  onSelect?: (message: MetabotDebugToolCallMessage) => void;
}) => {
  const [isModalOpen, { open, close }] = useDisclosure(false);
  const clipboard = useClipboard();
  const handleCopy = () => clipboard.copy(JSON.stringify(message, null, 2));
  const handleClick = () => (onSelect ? onSelect(message) : open());

  return (
    <>
      <Flex
        p="sm"
        pl="md"
        bd="1px solid var(--mb-color-border-neutral)"
        bdrs="sm"
        direction="row"
        align="center"
        justify="space-between"
        className={cx(Styles.agentPartCard, Styles.agentPartClickable)}
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        <Flex align="center">
          <Icon name="gear" c="text-secondary" mr="sm" />
          <Text fw="bold">{message.name}</Text>
        </Flex>
        <Flex align="center" gap="xs" className={Styles.agentPartActions}>
          <Tooltip label={clipboard.copied ? t`Copied!` : t`Copy`}>
            <ActionIcon
              h="sm"
              aria-label={t`Copy tool call JSON`}
              onClick={(e) => {
                e.stopPropagation();
                handleCopy();
              }}
              className={Styles.agentPartActionIcon}
            >
              <Icon name="copy" size="1rem" />
            </ActionIcon>
          </Tooltip>
        </Flex>
      </Flex>
      {isModalOpen && (
        <ToolCallDetailsModal message={message} onClose={close} />
      )}
    </>
  );
};
