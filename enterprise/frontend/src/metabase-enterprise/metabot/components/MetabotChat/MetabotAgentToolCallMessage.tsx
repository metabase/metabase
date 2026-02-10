import { useClipboard, useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";
import { t } from "ttag";

import { CodeEditor } from "metabase/common/components/CodeEditor";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Flex,
  Icon,
  Modal,
  Stack,
  Text,
} from "metabase/ui";
import type { MetabotDebugToolCallMessage } from "metabase-enterprise/metabot/state";

const ToolCallDetailsModal = ({
  message,
  onClose,
}: {
  message: MetabotDebugToolCallMessage;
  onClose: () => void;
}) => {
  const clipboard = useClipboard();
  const copy = (value: any) => clipboard.copy(JSON.stringify(value, null, 2));

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

  return (
    <Modal
      opened
      onClose={onClose}
      size="lg"
      title={
        <Flex align="center">
          {t`Tool Call: ${message.name}`}
          <Badge ml="sm" color="text-primary">
            {message.id}
          </Badge>
        </Flex>
      }
      data-testid="tool-call-details-modal"
    >
      <Stack gap="md">
        {message.args && (
          <Stack gap="xs">
            <Flex gap="xs">
              <Text fw="bold">{t`Request`}</Text>
              <ActionIcon h="sm" onClick={() => copy(parsedArgs)}>
                <Icon name="copy" size="1rem" />
              </ActionIcon>
            </Flex>
            <Box mx="-1.5rem">
              <CodeEditor value={parsedArgs} language="json" readOnly />
            </Box>
          </Stack>
        )}

        {message.result && (
          <Stack gap="xs">
            <Flex gap="xs">
              <Flex align="center">
                <Text fw="bold">{t`Response`}</Text>
                {message.is_error && (
                  <Badge ml="sm" bg="danger" c="text-primary-inverse">
                    {t`Errored`}
                  </Badge>
                )}
              </Flex>
              <ActionIcon h="sm" onClick={() => copy(message.result)}>
                <Icon name="copy" size="1rem" />
              </ActionIcon>
            </Flex>
            <Box mx="-1.5rem">
              <CodeEditor value={message.result} readOnly />
            </Box>
          </Stack>
        )}
      </Stack>
    </Modal>
  );
};

export const AgentToolCallMessage = ({
  message,
}: {
  message: MetabotDebugToolCallMessage;
}) => {
  const [modalOpen, { open, close }] = useDisclosure(false);
  const clipboard = useClipboard();
  const handleCopy = () => clipboard.copy(JSON.stringify(message, null, 2));

  return (
    <>
      <Flex
        p="sm"
        pl="md"
        bg="background-secondary"
        bd="1px solid var(--mb-color-border)"
        bdrs="sm"
        direction="row"
        align="center"
        justify="space-between"
      >
        <Flex>
          <Text mr="sm">🔧</Text>
          <Text fw="bold">{message.name}</Text>
        </Flex>
        <Flex align="center" gap="xs">
          <Button
            variant="light"
            size="compact-xs"
            onClick={open}
          >{t`View`}</Button>
          <ActionIcon h="sm" onClick={handleCopy}>
            <Icon name="copy" size="1rem" />
          </ActionIcon>
        </Flex>
      </Flex>
      {modalOpen && <ToolCallDetailsModal message={message} onClose={close} />}
    </>
  );
};
