import { useSecurityIssueIndicators } from "../../hooks/use-security-issue-indicators";
import { IssueDot } from "../IssueDot/IssueDot";

export const SecurityCenterBadge = () => {
  const { hasAffectingAdvisory, hasFailingCheck } =
    useSecurityIssueIndicators();

  if (!hasAffectingAdvisory && !hasFailingCheck) {
    return null;
  }

  return <IssueDot />;
};
