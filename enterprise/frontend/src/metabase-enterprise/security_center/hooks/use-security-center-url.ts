import * as Urls from "metabase/urls";

import { useSecurityIssueIndicators } from "./use-security-issue-indicators";

export const useSecurityCenterUrl = () => {
  const { hasAffectingAdvisory, hasFailingCheck } =
    useSecurityIssueIndicators();
  const hasOnlyFailingChecks = hasFailingCheck && !hasAffectingAdvisory;

  return hasOnlyFailingChecks
    ? Urls.securityCenterHealthChecks()
    : Urls.securityCenter();
};
