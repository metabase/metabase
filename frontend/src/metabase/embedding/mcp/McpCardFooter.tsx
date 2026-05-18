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
  isSubmittingFeedback: boolean;
  onSelectFeedback: (feedback: McpFeedbackChoice) => void;
  submittedFeedback: McpFeedbackChoice | null;
}

export const McpCardFooter = ({
  app,
  footerStyle,
  instanceUrl,
  isSubmittingFeedback,
  onSelectFeedback,
  submittedFeedback,
}: McpCardFooterProps) => (
  <Flex
    h="50px"
    align="center"
    justify="space-between"
    bg="background-secondary"
    style={footerStyle}
  >
    <Flex align="center" gap="xs">
      <McpFeedbackButtons
        isSubmitting={isSubmittingFeedback}
        submittedFeedback={submittedFeedback}
        onSelectFeedback={onSelectFeedback}
      />
    </Flex>

    <McpExploreButton app={app} instanceUrl={instanceUrl} />
  </Flex>
);
