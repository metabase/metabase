import { useSecurityIssues } from "../../hooks/use-security-issues";
import { IssueDot } from "../IssueDot/IssueDot";

export const SecurityCenterBadge = () => {
  const { hasAffectingAdvisory, hasFailingCheck } = useSecurityIssues();

  if (!hasAffectingAdvisory && !hasFailingCheck) {
    return null;
  }

  return <IssueDot />;
};
