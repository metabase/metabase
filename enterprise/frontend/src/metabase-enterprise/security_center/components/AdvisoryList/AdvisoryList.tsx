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

  return (
    <Stack gap="md" className={className}>
      {sorted.map((advisory) => (
        <AdvisoryCard
          key={advisory.advisory_id}
          advisory={advisory}
          onAcknowledge={onAcknowledge}
        />
      ))}
    </Stack>
  );
}
