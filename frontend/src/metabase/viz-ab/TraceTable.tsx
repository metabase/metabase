import { useState } from "react";
import { t } from "ttag";

import { Box, Button, Stack, Text } from "metabase/ui";
import type {
  Decision,
  ScoredCandidate,
} from "metabase/visualizations/lib/default-viz/types";

const MAX_ROWS = 15;

function formatScore(score: number): string {
  return Number.isFinite(score) ? score.toFixed(1) : "∞";
}

function describeCandidate(candidate: ScoredCandidate): string {
  if (!candidate.feasible) {
    return candidate.hardFailures.map((failure) => failure.id).join(", ");
  }
  return candidate.penalties
    .filter((penalty) => penalty.contribution !== 0)
    .map((penalty) => `${penalty.id} ${penalty.contribution.toFixed(1)}`)
    .join(" · ");
}

export function TraceTable({ decision }: { decision: Decision }) {
  const [open, setOpen] = useState(false);
  const candidates = decision.trace.candidates.slice(0, MAX_ROWS);

  return (
    <Stack gap="xs">
      <Button
        size="compact-xs"
        variant="subtle"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? t`Hide decision trace` : t`Show decision trace`}
      </Button>
      {open && (
        <Box style={{ overflowX: "auto" }}>
          <Box component="table" style={{ fontSize: 11, borderSpacing: 4 }}>
            <thead>
              <tr>
                <th align="left">{t`candidate`}</th>
                <th align="right">{t`score`}</th>
                <th align="left">{t`penalties / failures`}</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate) => (
                <tr
                  key={candidate.id}
                  style={{
                    fontWeight:
                      candidate.id === decision.trace.chosenId
                        ? "bold"
                        : "normal",
                    opacity: candidate.feasible ? 1 : 0.5,
                  }}
                >
                  <td>{candidate.id}</td>
                  <td align="right">{formatScore(candidate.score)}</td>
                  <td>{describeCandidate(candidate)}</td>
                </tr>
              ))}
            </tbody>
          </Box>
          {decision.trace.warnings.length > 0 && (
            <Text size="xs" c="warning">
              {decision.trace.warnings.join(" · ")}
            </Text>
          )}
        </Box>
      )}
    </Stack>
  );
}
