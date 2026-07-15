import type { App } from "@modelcontextprotocol/ext-apps/react";
import type { CSSProperties } from "react";

import { Flex } from "metabase/ui";

import { McpExploreButton } from "./McpExploreButton";
import type { McpFeedbackChoice } from "./McpFeedbackArea";
import { McpFeedbackButtons } from "./McpFeedbackButtons";

export interface McpCardFooterProps {
  app: App | null;
  footerStyle: CSSProperties;
  instanceUrl: string;
  isFeedbackEnabled: boolean;
  isSubmittingFeedback: boolean;
  onSelectFeedback: (feedback: McpFeedbackChoice) => void;
  submittedFeedback: McpFeedbackChoice | null;
}

export const McpCardFooter = ({
  app,
  footerStyle,
  instanceUrl,
  isFeedbackEnabled,
  isSubmittingFeedback,
  onSelectFeedback,
  submittedFeedback,
}: McpCardFooterProps) => (
  <Flex
    h="50px"
    align="center"
    justify="space-between"
    bg="background_page-secondary"
    style={footerStyle}
  >
    <Flex align="center" gap="xs">
      {isFeedbackEnabled && (
        <McpFeedbackButtons
          isSubmitting={isSubmittingFeedback}
          submittedFeedback={submittedFeedback}
          onSelectFeedback={onSelectFeedback}
        />
      )}
    </Flex>

    <McpExploreButton app={app} instanceUrl={instanceUrl} />
  </Flex>
);
