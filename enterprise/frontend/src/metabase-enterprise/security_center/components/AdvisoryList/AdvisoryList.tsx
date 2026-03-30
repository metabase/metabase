import { t } from "ttag";

import { Stack, Text } from "metabase/ui";

import type { Advisory } from "../../types";
import { sortAdvisories } from "../../utils";
import { AdvisoryCard } from "../AdvisoryCard/AdvisoryCard";

interface AdvisoryListProps {
  advisories: Advisory[];
  onAcknowledge?: (advisoryId: string) => void;
}

export function AdvisoryList({ advisories, onAcknowledge }: AdvisoryListProps) {
  const sorted = sortAdvisories(advisories);

  if (sorted.length === 0) {
    return (
      <Text c="text-secondary" data-testid="empty-state">
        {t`Your instance is up to date — no known security issues affect your configuration.`}
      </Text>
    );
  }

  return (
    <Stack gap="md">
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
