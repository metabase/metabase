import { useState } from "react";
import { t } from "ttag";

import { Stack, Text, UnstyledButton } from "metabase/ui";

import type { IntrospectorReason } from "../types";

/**
 * Mantine color name for a reason's flag. Mirrors the palette in
 * `ConditionBadges` so the per-flag color is consistent across:
 *
 *   • the Status column badges (broken / stale / unreferenced)
 *   • the Reasons column code prefix in both ContentTable and TransformsTable
 */
export function reasonFlagColor(
  flag: IntrospectorReason["flag"],
): "error" | "warning" | "brand" {
  switch (flag) {
    case "broken":
      return "error";
    case "stale":
      return "warning";
    case "unreferenced":
      return "brand";
  }
}

/**
 * Truncate length for a reason's detail before we hide the rest behind a
 * "Show more" button. Picked to keep most reasons on a single line in the
 * Reasons column at 1440px wide; longer messages (typical for stack-trace
 * residue) get hidden until clicked.
 */
const TRUNCATE_AT = 140;

function shorten(detail: string): string {
  // Cut at a word boundary if we can find one near the limit; otherwise
  // hard-cut. Always end with an ellipsis so it's obvious there's more.
  const slice = detail.slice(0, TRUNCATE_AT);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > TRUNCATE_AT - 30 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

function ReasonRow({ reason }: { reason: IntrospectorReason }) {
  const [expanded, setExpanded] = useState(false);
  const long = reason.detail.length > TRUNCATE_AT;
  const visible = !long || expanded ? reason.detail : shorten(reason.detail);
  return (
    <Text size="xs" c="text-secondary">
      <Text component="span" fw={600} c={reasonFlagColor(reason.flag)}>
        {reason.code}
      </Text>
      {" — "}
      {visible}
      {long && (
        <>
          {" "}
          <UnstyledButton
            component="span"
            onClick={() => setExpanded((v) => !v)}
            style={{ cursor: "pointer" }}
            aria-expanded={expanded}
          >
            <Text component="span" size="xs" c="brand" td="underline">
              {expanded ? t`Show less` : t`Show more`}
            </Text>
          </UnstyledButton>
        </>
      )}
    </Text>
  );
}

/**
 * Renders the per-row Reasons cell shared by ContentTable (cards/dashboards)
 * and TransformsTable. Long details collapse to a one-line excerpt with an
 * inline `Show more` toggle so the row stays compact by default.
 */
export function ReasonsCell({
  reasons,
}: {
  reasons: IntrospectorReason[] | undefined;
}) {
  const list = reasons ?? [];
  if (!list.length) {
    return (
      <Text size="sm" c="text-secondary">
        —
      </Text>
    );
  }
  return (
    <Stack gap={4}>
      {list.map((r, i) => (
        <ReasonRow key={`${r.code}-${i}`} reason={r} />
      ))}
    </Stack>
  );
}
