import { Box } from "metabase/ui";

export const IssueDot = () => (
  <Box
    w={8}
    h={8}
    miw={8}
    bg="feedback-negative"
    style={{ borderRadius: "50%", flexShrink: 0 }}
    data-testid="issue-dot"
  />
);
