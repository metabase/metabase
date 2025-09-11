import { useState } from "react";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { Accordion, Box, Code, Stack, Text } from "metabase/ui";
import type { MetabotToolCall } from "metabase-enterprise/metabot/state";

interface MetabotDebugToolCallProps {
  toolCall: MetabotToolCall;
}

export const MetabotDebugToolCall = ({
  toolCall,
}: MetabotDebugToolCallProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Box
      p="sm"
      mb="xs"
      style={{
        backgroundColor: color("brand-light"),
        borderLeft: `4px solid ${color("brand")}`,
        borderRadius: "8px",
      }}
      data-testid="metabot-debug-tool-call"
    >
      <Stack gap="xs">
        <Text size="sm" fw="bold" c="brand">
          {t`🔧 Tool Call: ${toolCall.name}`}
        </Text>
        <Text size="sm" c="text-medium">
          {t`Status: ${toolCall.status === "started" ? t`Running...` : t`Completed`}`}
        </Text>
        {toolCall.message && (
          <Text size="sm" c="text-medium">
            {toolCall.message}
          </Text>
        )}

        <Accordion
          value={isExpanded ? "details" : null}
          onChange={(value) => setIsExpanded(value === "details")}
        >
          <Accordion.Item value="details">
            <Accordion.Control>
              <Text size="xs" c="text-medium">
                {t`Show Request/Response Details`}
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="md">
                {toolCall.args && (
                  <Box>
                    <Text size="xs" fw="bold" c="text-medium" mb="xs">
                      {t`Request Arguments:`}
                    </Text>
                    <Code
                      block
                      style={{
                        backgroundColor: color("bg-light"),
                        maxHeight: "150px",
                        overflow: "auto",
                        fontSize: "11px",
                      }}
                    >
                      {typeof toolCall.args === "string"
                        ? toolCall.args
                        : JSON.stringify(toolCall.args, null, 2)}
                    </Code>
                  </Box>
                )}

                {toolCall.result !== undefined && (
                  <Box>
                    <Text size="xs" fw="bold" c="text-medium" mb="xs">
                      {t`Response Result:`}
                    </Text>
                    <Code
                      block
                      style={{
                        backgroundColor: color("bg-light"),
                        maxHeight: "150px",
                        overflow: "auto",
                        fontSize: "11px",
                      }}
                    >
                      {typeof toolCall.result === "string"
                        ? toolCall.result
                        : JSON.stringify(toolCall.result, null, 2)}
                    </Code>
                  </Box>
                )}

                <Box>
                  <Text size="xs" fw="bold" c="text-medium" mb="xs">
                    {t`Full Tool Call Object:`}
                  </Text>
                  <Code
                    block
                    style={{
                      backgroundColor: color("bg-light"),
                      maxHeight: "200px",
                      overflow: "auto",
                      fontSize: "11px",
                    }}
                  >
                    {JSON.stringify(toolCall, null, 2)}
                  </Code>
                </Box>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Stack>
    </Box>
  );
};
