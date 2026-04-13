import cx from "classnames";
import { t } from "ttag";

import { Box, Title } from "metabase/ui";
import type { Advisory, AdvisoryId } from "metabase-types/api";

import { sortAdvisories } from "../../utils";
import { AdvisoryCard } from "../AdvisoryCard/AdvisoryCard";

import S from "./AdvisoryList.module.css";

interface AdvisoryListProps {
  advisories: Advisory[];
  onAcknowledge?: (advisoryId: AdvisoryId) => void;
  className?: string;
}

function AdvisorySection({
  advisories,
  onAcknowledge,
}: {
  advisories: Advisory[];
  onAcknowledge?: (advisoryId: AdvisoryId) => void;
}) {
  return (
    <Box className={S.advisoryList}>
      {advisories.map((advisory) => (
        <AdvisoryCard
          key={advisory.advisory_id}
          advisory={advisory}
          onAcknowledge={onAcknowledge}
        />
      ))}
    </Box>
  );
}

export function AdvisoryList({
  advisories,
  onAcknowledge,
  className,
}: AdvisoryListProps) {
  const { affecting, notAffecting } = sortAdvisories(advisories);

  return (
    <Box className={cx(className, S.root)}>
      {affecting.length > 0 && (
        <Box>
          <Title order={4} mb="md">{t`Affecting your instance`}</Title>
          <AdvisorySection
            advisories={affecting}
            onAcknowledge={onAcknowledge}
          />
        </Box>
      )}
      {notAffecting.length > 0 && (
        <Box>
          <Title order={4} mb="md">{t`Other alerts`}</Title>
          <AdvisorySection
            advisories={notAffecting}
            onAcknowledge={onAcknowledge}
          />
        </Box>
      )}
    </Box>
  );
}
