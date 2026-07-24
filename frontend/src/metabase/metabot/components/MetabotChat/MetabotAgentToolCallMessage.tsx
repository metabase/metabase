import { useClipboard, useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";

import { CodeEditor } from "metabase/common/components/CodeEditor";
import type { MetabotDebugToolCallMessage } from "metabase/metabot/state";
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

export const ToolCallDetailsContent = ({
  message,
  boxed = false,
}: {
  message: MetabotDebugToolCallMessage;
  /**
   * When true, wraps each JSON block in a bordered, padded box instead of
   * bleeding it to the container's edges — used by the sidebar; the modal
   * keeps the edge-to-edge look.
   */
  boxed?: boolean;
}) => {
  const argsClipboard = useClipboard();
  const resultClipboard = useClipboard();
  const codeBoxProps = boxed
    ? {
        p: "xs" as const,
        bd: "1px solid var(--mb-color-border-neutral)",
        bdrs: "sm" as const,
      }
    : { mx: "-1.5rem" };

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

  const parsedResult = useMemo(() => {
    if (!message.result) {
      return "";
    }
    try {
      return JSON.stringify(JSON.parse(message.result), null, 2);
    } catch {
      return message.result;
    }
  }, [message.result]);

  return (
    <Stack gap="md">
      {message.args && (
        <Stack gap="xs">
          <Flex gap="xs">
            <Text fw="bold">{t`Request`}</Text>
            <Tooltip label={argsClipboard.copied ? t`Copied!` : t`Copy`}>
              <ActionIcon
                h="sm"
                aria-label={t`Copy request JSON`}
                onClick={() => argsClipboard.copy(parsedArgs)}
              >
                <Icon name="copy" size="1rem" />
              </ActionIcon>
            </Tooltip>
          </Flex>
          <Box {...codeBoxProps}>
            <CodeEditor value={parsedArgs} language="json" readOnly />
          </Box>
        </Stack>
      )}

      {message.result && (
        <Stack gap="xs">
          <Flex gap="xs">
            <Flex align="center" gap="sm">
              <Text fw="bold">{t`Response`}</Text>
              {message.is_error && (
                <Badge color="negative" size="sm">
                  {t`Errored`}
                </Badge>
              )}
            </Flex>
            <Tooltip label={resultClipboard.copied ? t`Copied!` : t`Copy`}>
              <ActionIcon
                h="sm"
                aria-label={t`Copy response JSON`}
                onClick={() => resultClipboard.copy(parsedResult)}
              >
                <Icon name="copy" size="1rem" />
              </ActionIcon>
            </Tooltip>
          </Flex>
          <Box {...codeBoxProps}>
            <CodeEditor value={parsedResult} language="json" readOnly />
          </Box>
        </Stack>
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
  /**
   * When provided, clicking the tool call defers to this callback instead of
   * opening the built-in modal — used by hosts (e.g. the AI Auditing
   * Conversation Detail page) that show tool call details in their own
   * sidebar instead.
   */
  onSelect?: (message: MetabotDebugToolCallMessage) => void;
}) => {
  const [modalOpen, { open, close }] = useDisclosure(false);
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
      {!onSelect && modalOpen && (
        <ToolCallDetailsModal message={message} onClose={close} />
      )}
    </>
  );
};
