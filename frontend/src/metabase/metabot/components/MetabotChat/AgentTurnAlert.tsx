import type { ReactNode } from "react";

import type { MetabotAgentTurnError } from "metabase/metabot/state";
import { Box, Card, Flex, Icon, Text } from "metabase/ui";

const MESSAGE_LINE_HEIGHT = "1.25rem";
const ICON_SIZE = "1rem";

export const AgentTurnAlert = ({
  variant,
  message,
  cta,
  footer,
  debugDetails,
}: {
  variant: "error" | "info";
  message: ReactNode;
  cta?: ReactNode;
  footer?: ReactNode;
  debugDetails?: MetabotAgentTurnError;
}) => (
  <Flex
    direction="column"
    gap="xxs"
    p="sm"
    bd="1px solid var(--mb-color-border-neutral)"
    bdrs="xs"
    data-testid="metabot-chat-message-turn-alert"
    bg="background_page-primary"
  >
    <Flex align="flex-start" gap="sm">
      <Flex h={MESSAGE_LINE_HEIGHT} align="center" flex="0 0 auto">
        <Icon
          name={variant === "error" ? "warning" : "info"}
          c={variant === "error" ? "feedback-negative" : "text-secondary"}
          size={ICON_SIZE}
        />
      </Flex>
      <Text c="text-secondary" size="sm" lh={MESSAGE_LINE_HEIGHT} flex="1">
        {message}
      </Text>
      {cta && <Box style={{ alignSelf: "center" }}>{cta}</Box>}
    </Flex>
    {debugDetails && (
      <Card
        bdrs="xxs"
        ml="xl"
        p="sm"
        withBorder
        shadow="none"
        c="text-secondary"
        fz="xs"
        ff="monospace"
        style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
        data-testid="metabot-chat-message-turn-alert-debug"
      >
        {JSON.stringify(debugDetails, null, 2)}
      </Card>
    )}
    {footer && <Box ml="xl">{footer}</Box>}
  </Flex>
);
