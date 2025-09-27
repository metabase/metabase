import { t } from "ttag";

import { useSdkDispatch } from "embedding-sdk-bundle/store";
import {
  Button,
  Flex,
  Icon,
  Loader,
  Menu,
  Stack,
  Textarea,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import {
  useMetabotAgent,
  useMetabotChatHandlers,
} from "metabase-enterprise/metabot/hooks";
import { cancelInflightAgentRequests } from "metabase-enterprise/metabot/state";

import S from "./MetabotQuestion.module.css";

interface SidebarInputProps {
  suggestedPrompts: Array<{ prompt: string }>;
  hasMessages: boolean;
  onSubmitPrompt: (prompt: string) => void;
}

export function SidebarInput({
  suggestedPrompts,
  hasMessages,
  onSubmitPrompt,
}: SidebarInputProps) {
  const metabot = useMetabotAgent();
  const { handleSubmitInput, handleResetInput } = useMetabotChatHandlers();
  const dispatch = useSdkDispatch();

  const placeholder = metabot.isDoingScience
    ? t`Doing science...`
    : t`Ask AI a question...`;

  const cancelRequest = () => {
    dispatch(cancelInflightAgentRequests());
  };

  const resetInput = () => {
    handleResetInput();
  };

  const startNewConversation = () => {
    metabot.resetConversation();
  };

  const shouldShowSuggestedPrompts =
    !hasMessages && !metabot.isDoingScience && suggestedPrompts.length > 0;

  return (
    <Stack gap={0}>
      {shouldShowSuggestedPrompts && (
        <Stack gap="sm" p="md" className={S.promptSuggestionsContainer}>
          {suggestedPrompts.map(({ prompt }, index) => (
            <Button
              key={index}
              size="xs"
              variant="outline"
              fw={400}
              onClick={() => onSubmitPrompt(prompt)}
              className={S.promptSuggestionButton}
            >
              {prompt}
            </Button>
          ))}
        </Stack>
      )}

      {/* Input area */}
      <Flex
        gap="xs"
        px="md"
        pt="0.6rem"
        pb="0.2rem"
        style={{ borderTop: "1px solid var(--mb-color-border)" }}
        align="center"
        justify="center"
      >
        <Flex
          style={{ flexShrink: 0, marginBottom: "8px" }}
          justify="center"
          align="center"
        >
          {metabot.isDoingScience ? (
            <Loader size="sm" />
          ) : (
            <Icon name="ai" c="var(--mb-color-brand)" size="1rem" />
          )}
        </Flex>

        <Textarea
          id="metabot-chat-input"
          data-testid="metabot-chat-input"
          w="100%"
          autosize
          minRows={1}
          maxRows={4}
          ref={metabot.promptInputRef}
          autoFocus
          value={metabot.prompt}
          disabled={metabot.isDoingScience}
          placeholder={placeholder}
          onChange={(e) => metabot.setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) {
              return;
            }

            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              handleSubmitInput(metabot.prompt);
            }
          }}
          styles={{
            input: {
              border: "none",
              borderRadius: "0",
              backgroundColor: "transparent",
              "&:focus": {
                outline: "none",
                borderColor: "transparent",
              },
            },
          }}
        />

        {metabot.isDoingScience && (
          <UnstyledButton
            h="1rem"
            data-testid="metabot-cancel-request"
            onClick={cancelRequest}
            style={{ marginBottom: "8px" }}
          >
            <Tooltip label={t`Stop generation`}>
              <Icon
                name="stop"
                c="var(--mb-color-text-secondary)"
                size="1rem"
              />
            </Tooltip>
          </UnstyledButton>
        )}

        {!metabot.isDoingScience && metabot.prompt.length > 0 && (
          <UnstyledButton
            h="1rem"
            onClick={resetInput}
            data-testid="metabot-close-chat"
            style={{ marginBottom: "8px" }}
          >
            <Icon name="close" c="var(--mb-color-text-secondary)" size="1rem" />
          </UnstyledButton>
        )}

        {/* Overflow menu - only shown in stacked layout and auto layout mobile */}
        <Menu position="top-end" withinPortal>
          <Menu.Target>
            <UnstyledButton
              data-testid="metabot-overflow-button"
              className={S.stackedOverflowButton}
            >
              <Icon name="ellipsis" c="var(--mb-color-text-secondary)" />
            </UnstyledButton>
          </Menu.Target>

          <Menu.Dropdown>
            <Menu.Item
              leftSection={<Icon name="edit_document_outlined" size="1rem" />}
              onClick={startNewConversation}
            >
              {t`Start new chat`}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Flex>
    </Stack>
  );
}
