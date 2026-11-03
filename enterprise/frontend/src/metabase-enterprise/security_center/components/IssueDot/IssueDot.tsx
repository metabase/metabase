import { Box } from "metabase/ui";

type IssueDotProps = {
  "data-testid"?: string;
};

export const IssueDot = ({
  "data-testid": testId = "issue-dot",
}: IssueDotProps) => (
  <Box
    w={8}
    h={8}
    miw={8}
    bg="feedback-negative"
    style={{ borderRadius: "50%", flexShrink: 0 }}
    data-testid={testId}
  />
);
