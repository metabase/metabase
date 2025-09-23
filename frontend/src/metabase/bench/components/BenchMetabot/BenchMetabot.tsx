import { useMemo, useEffect } from "react";
import { t } from "ttag";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Icon,
  Paper,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from "metabase/ui";
import { useGetSuggestedMetabotPromptsQuery } from "metabase-enterprise/api";
import {
  useMetabotAgent,
  useMetabotChatHandlers,
} from "metabase-enterprise/metabot/hooks";
import { Messages } from "metabase-enterprise/metabot/components/MetabotChat/MetabotChatMessage";
import { MetabotThinking } from "metabase-enterprise/metabot/components/MetabotChat/MetabotThinking";
import ErrorBoundary from "metabase/ErrorBoundary";

export const BenchMetabot = () => {
  const metabot = useMetabotAgent();
  const { handleSubmitInput, handleRetryMessage, handleResetInput } =
    useMetabotChatHandlers();

  // Force the metabot to be visible for our bench tab
  useEffect(() => {
    if (!metabot.visible) {
      metabot.setVisible(true);
    }
  }, [metabot]);

  const hasMessages =
    metabot.messages.length > 0 || metabot.errorMessages.length > 0;

  const suggestedPromptsReq = useGetSuggestedMetabotPromptsQuery({
    metabot_id: metabot.metabotId,
    limit: 3,
    sample: true,
  });

  const suggestedPrompts = useMemo(() => {
    return suggestedPromptsReq.currentData?.prompts ?? [];
  }, [suggestedPromptsReq.currentData?.prompts]);

  return (
    <ErrorBoundary errorComponent={() => null}>
      <Box
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "16px",
        }}
      >
        {/* Header */}
        <Box style={{ marginBottom: "16px" }}>
          <Flex justify="space-between" align="center">
            <Text size="sm" c="dimmed">
              {t`Metabot isn't perfect. Double-check results.`}
            </Text>
            <Tooltip label={t`Clear conversation`} position="bottom">
              <ActionIcon
                onClick={() => metabot.resetConversation()}
                data-testid="metabot-reset-chat"
              >
                <Icon name="revert" />
              </ActionIcon>
            </Tooltip>
          </Flex>
        </Box>

        {/* Messages Area */}
        <Box
          style={{
            flex: 1,
            overflow: "auto",
            marginBottom: "16px",
            border: "1px solid var(--mantine-color-gray-3)",
            borderRadius: "8px",
            padding: "8px",
          }}
        >
          {!hasMessages && !metabot.isDoingScience && (
            <Flex
              h="100%"
              gap="md"
              direction="column"
              align="center"
              justify="center"
            >
              <Text size="lg" fw="bold" c="text-primary">
                {t`Ask Metabot anything`}
              </Text>
              <Text size="sm" c="text-secondary" ta="center">
                {t`Get help with SQL, data analysis, or transform development`}
              </Text>

              {suggestedPrompts.length > 0 && (
                <Stack gap="xs" style={{ marginTop: "16px" }}>
                  <Text size="sm" c="text-secondary">
                    {t`Suggested prompts:`}
                  </Text>
                  {suggestedPrompts.map((prompt, index) => (
                    <Button
                      key={index}
                      variant="subtle"
                      size="xs"
                      onClick={() => handleSubmitInput(prompt)}
                    >
                      {prompt}
                    </Button>
                  ))}
                </Stack>
              )}
            </Flex>
          )}

          {hasMessages && (
            <Messages
              messages={metabot.messages}
              errorMessages={metabot.errorMessages}
              onRetryMessage={handleRetryMessage}
            />
          )}

          {metabot.isDoingScience && <MetabotThinking />}
        </Box>

        {/* Input Area */}
        <Box>
          <Flex gap="sm">
            <Textarea
              placeholder={t`Ask Metabot anything...`}
              value={metabot.prompt || ""}
              onChange={(e) => metabot.setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmitInput(metabot.prompt || "");
                }
              }}
              style={{ flex: 1 }}
              minRows={2}
              maxRows={4}
            />
            <ActionIcon
              size="lg"
              onClick={() => handleSubmitInput(metabot.prompt || "")}
              disabled={
                !(metabot.prompt || "").trim() || metabot.isDoingScience
              }
            >
              <Icon name="send" />
            </ActionIcon>
          </Flex>
        </Box>
      </Box>
    </ErrorBoundary>
  );
};
