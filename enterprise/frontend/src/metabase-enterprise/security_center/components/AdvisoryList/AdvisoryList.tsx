import cx from "classnames";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { Badge, Box, Group, Title } from "metabase/ui";
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
  isAffecting,
  onAcknowledge,
}: {
  advisories: Advisory[];
  isAffecting: boolean;
  onAcknowledge?: (advisoryId: AdvisoryId) => void;
}) {
  return (
    <Box className={S.advisoryList}>
      {advisories.map((advisory) => (
        <AdvisoryCard
          key={advisory.advisory_id}
          advisory={advisory}
          isAffecting={isAffecting}
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

  if (advisories.length === 0) {
    return (
      <Box className={cx(className, S.root, S.emptyRoot)}>
        <EmptyState
          icon="shield_outline"
          message={t`Your instance is up to date — no known security issues affect your configuration.`}
        />
      </Box>
    );
  }

  return (
    <Box className={cx(className, S.root)}>
      {affecting.length > 0 && (
        <Box>
          <Group gap="sm" mb="md" align="center">
            <Badge size="sm" className={S.countBadge}>
              {affecting.length}
            </Badge>
            <Title order={4}>{t`Affecting your instance`}</Title>
          </Group>
          <AdvisorySection
            advisories={affecting}
            isAffecting
            onAcknowledge={onAcknowledge}
          />
        </Box>
      )}
      {notAffecting.length > 0 && (
        <Box>
          <Title order={4} mb="md">{t`Other alerts`}</Title>
          <AdvisorySection
            advisories={notAffecting}
            isAffecting={false}
            onAcknowledge={onAcknowledge}
          />
        </Box>
      )}
    </Box>
  );
}
