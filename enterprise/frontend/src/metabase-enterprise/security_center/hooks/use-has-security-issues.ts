import {
  useListHealthChecksQuery,
  useListSecurityAdvisoriesQuery,
} from "../api";
import { isAffected } from "../utils";

export const useHasSecurityIssues = () => {
  const { data: advisoriesResponse } = useListSecurityAdvisoriesQuery();
  const { data: healthChecksResponse } = useListHealthChecksQuery();
  const hasAffectingAdvisory =
    advisoriesResponse?.advisories.some(isAffected) ?? false;
  const hasFailingCheck =
    healthChecksResponse?.checks.some((check) => check.status === "fail") ??
    false;

  return hasAffectingAdvisory || hasFailingCheck;
};
