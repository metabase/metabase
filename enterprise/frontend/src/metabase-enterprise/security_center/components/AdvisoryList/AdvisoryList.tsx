import cx from "classnames";

import { Box } from "metabase/ui";
import type { Advisory, AdvisoryId } from "metabase-types/api";

import { sortAdvisories } from "../../utils";
import { AdvisoryCard } from "../AdvisoryCard/AdvisoryCard";

import S from "./AdvisoryList.module.css";

interface AdvisoryListProps {
  advisories: Advisory[];
  onAcknowledge?: (advisoryId: AdvisoryId) => void;
  className?: string;
}

export function AdvisoryList({
  advisories,
  onAcknowledge,
  className,
}: AdvisoryListProps) {
  const sorted = sortAdvisories(advisories);

  return (
    <Box className={cx(className, S.advisoryList)}>
      {sorted.map((advisory) => (
        <AdvisoryCard
          key={advisory.advisory_id}
          advisory={advisory}
          onAcknowledge={onAcknowledge}
        />
      ))}
    </Box>
  );
}
