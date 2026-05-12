import { c, t } from "ttag";

import { Box, Group, Stack, Text } from "metabase/ui";

import { DefragLoader } from "../DefragLoader";

import S from "./OptimizationDegreeDial.module.css";

export type DialStatus = "streaming" | "done" | "error" | "idle";

type Props = {
  status: DialStatus;
  score: number | null;
  errorMessage?: string | null;
};

const SIZE = 96;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function OptimizationDegreeDial({
  status,
  score,
  errorMessage,
}: Props) {
  if (status === "streaming" && score == null) {
    return <DefragLoader />;
  }

  if (status === "error") {
    return (
      <Group gap="md" align="center">
        <Box className={S.errorChip} aria-hidden />
        <Stack gap={2}>
          <Text fw="bold" c="error">{t`Couldn't analyze transform`}</Text>
          {errorMessage && <Text c="text-secondary">{errorMessage}</Text>}
        </Stack>
      </Group>
    );
  }

  const value = clampScore(score);
  const bucket = bucketFor(value);
  // The dial fills proportionally to how *optimized* the query is, so a
  // green sliver matches a healthy score.
  const dashOffset = CIRCUMFERENCE * (1 - value / 100);

  return (
    <Group
      gap="md"
      align="center"
      role="img"
      aria-label={c("Optimization-degree dial label")
        .t`Optimization score ${value} out of 100`}
    >
      <Box className={S.dialWrap} style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          aria-hidden
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            className={S.track}
            strokeWidth={STROKE}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            className={S[bucket]}
          />
        </svg>
        <Box className={S.score}>
          <Text fz="xl" fw="bold" lh={1}>
            {value}
          </Text>
          <Text fz="xs" c="text-secondary">
            {c("Denominator for the optimization-degree score").t`/ 100`}
          </Text>
        </Box>
      </Box>
      <Stack gap={2}>
        <Text fw="bold">{bucketLabel(bucket)}</Text>
        <Text c="text-secondary">{bucketHint(bucket, status)}</Text>
      </Stack>
    </Group>
  );
}

function clampScore(score: number | null): number {
  if (score == null || !Number.isFinite(score)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

type Bucket = "green" | "greenYellow" | "orange" | "red";

function bucketFor(score: number): Bucket {
  if (score >= 100) {
    return "green";
  }
  if (score >= 70) {
    return "greenYellow";
  }
  if (score >= 40) {
    return "orange";
  }
  return "red";
}

function bucketLabel(bucket: Bucket): string {
  switch (bucket) {
    case "green":
      return t`Already optimized`;
    case "greenYellow":
      return t`Mostly optimized`;
    case "orange":
      return t`Optimization wins available`;
    case "red":
      return t`Multiple high-severity issues`;
  }
}

function bucketHint(bucket: Bucket, status: DialStatus): string {
  if (status === "streaming") {
    return t`Streaming proposals…`;
  }
  switch (bucket) {
    case "green":
      return t`No further changes to suggest.`;
    case "greenYellow":
      return t`Minor rewrites or indexes may help.`;
    case "orange":
      return t`Real speedups available — review the proposals below.`;
    case "red":
      return t`Multiple high-severity issues — review the proposals below.`;
  }
}
