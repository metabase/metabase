import { useMemo, useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box, Collapse, Group, Icon, Loader, Stack, Text } from "metabase/ui";
import { useGetWorkspaceProblemsQuery } from "metabase-enterprise/api";
import type { WorkspaceId } from "metabase-types/api";

import type { ProblemCheckCategory } from "../problemUtils";
import {
  formatProblemDetails,
  getCheckStatus,
  getCheckStatusWithUnused,
  getCheckTitle,
  groupProblemsByCategory,
} from "../problemUtils";

const CHECK_CATEGORIES: ProblemCheckCategory[] = [
  "external-dependencies",
  "internal-dependencies",
  "structural-issues",
  "unused-outputs",
];

type QualityChecksSectionProps = {
  workspaceId: WorkspaceId;
};

export const QualityChecksSection = ({
  workspaceId,
}: QualityChecksSectionProps) => {
  const {
    data: problems = [],
    error,
    isLoading,
  } = useGetWorkspaceProblemsQuery(workspaceId);
  const grouped = useMemo(() => groupProblemsByCategory(problems), [problems]);
  const [expandedChecks, setExpandedChecks] = useState<
    Set<ProblemCheckCategory>
  >(new Set());

  const toggleCheck = (category: ProblemCheckCategory) => {
    setExpandedChecks((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  return (
    <Stack gap="sm">
      <Text fw="bold">{t`Quality Checks`}</Text>

      <LoadingAndErrorWrapper error={error}>
        <Stack gap="sm">
          {CHECK_CATEGORIES.map((category) => {
            const categoryProblems = grouped[category];
            const checkStatus =
              category === "unused-outputs"
                ? getCheckStatusWithUnused(categoryProblems)
                : getCheckStatus(categoryProblems);
            const isExpanded = expandedChecks.has(category);
            const hasProblems = checkStatus.count > 0;

            return (
              <Box key={category}>
                <Group
                  justify="space-between"
                  style={{ cursor: hasProblems ? "pointer" : "default" }}
                  onClick={() => hasProblems && toggleCheck(category)}
                >
                  <Text>{getCheckTitle(category)}</Text>

                  {isLoading ? (
                    <Loader size="xs" aria-label={t`Loading`} />
                  ) : (
                    <Group gap="xs">
                      {checkStatus.status === "passed" && (
                        <Icon name="check" size={14} c="success" />
                      )}

                      <Text
                        c={
                          checkStatus.status === "passed"
                            ? "success"
                            : checkStatus.problems.some(
                                  (p) => p.severity === "error",
                                )
                              ? "error"
                              : "warning"
                        }
                      >
                        {checkStatus.status === "passed"
                          ? category === "unused-outputs" &&
                            checkStatus.count > 0
                            ? t`${checkStatus.count} info`
                            : t`Passed`
                          : checkStatus.count === 1
                            ? t`Failed`
                            : t`${checkStatus.count} issues`}
                      </Text>
                    </Group>
                  )}
                </Group>
                {hasProblems && (
                  <Collapse in={isExpanded}>
                    <Stack gap="xs" mt="xs" pl="md">
                      {checkStatus.problems.map((problem, idx) => (
                        <Box key={idx}>
                          <Text size="sm" c="text-secondary">
                            {formatProblemDetails(problem)}
                          </Text>
                        </Box>
                      ))}
                    </Stack>
                  </Collapse>
                )}
              </Box>
            );
          })}
        </Stack>
      </LoadingAndErrorWrapper>
    </Stack>
  );
};
