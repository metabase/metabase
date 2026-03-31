import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { Stack } from "metabase/ui";

import type { Advisory } from "../../types";
import { sortAdvisories } from "../../utils";
import { AdvisoryCard } from "../AdvisoryCard/AdvisoryCard";

interface AdvisoryListProps {
  advisories: Advisory[];
  onAcknowledge?: (advisoryId: string) => void;
  className?: string;
}

export function AdvisoryList({
  advisories,
  onAcknowledge,
  className,
}: AdvisoryListProps) {
  const sorted = sortAdvisories(advisories);

  if (sorted.length === 0) {
    return (
      <EmptyState
        className={className}
        icon="shield_outline"
        message={t`Your instance is up to date — no known security issues affect your configuration.`}
      />
    );
  }

  return (
    <Stack gap="md" className={className}>
      {sorted.map((advisory) => (
        <AdvisoryCard
          key={advisory.id}
          advisory={advisory}
          onAcknowledge={onAcknowledge}
        />
      ))}
    </Stack>
  );
}
