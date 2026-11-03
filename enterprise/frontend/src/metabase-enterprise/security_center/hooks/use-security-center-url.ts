import * as Urls from "metabase/urls";

import { useSecurityIssues } from "./use-security-issues";

export const useSecurityCenterUrl = () => {
  const { hasAffectingAdvisory, hasFailingCheck } = useSecurityIssues();
  const hasOnlyFailingChecks = hasFailingCheck && !hasAffectingAdvisory;

  return hasOnlyFailingChecks
    ? Urls.securityCenterHealthChecks()
    : Urls.securityCenter();
};
