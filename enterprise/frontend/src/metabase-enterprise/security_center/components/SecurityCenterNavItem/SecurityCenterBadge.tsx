import { Box } from "metabase/ui";

import { useHasSecurityIssues } from "../../hooks/use-has-security-issues";

export const SecurityCenterBadge = () => {
  const hasSecurityIssues = useHasSecurityIssues();

  if (!hasSecurityIssues) {
    return null;
  }

  return (
    <Box
      w={8}
      h={8}
      miw={8}
      bg="feedback-negative"
      style={{ borderRadius: "50%", flexShrink: 0 }}
      data-testid="security-center-badge"
    />
  );
};
