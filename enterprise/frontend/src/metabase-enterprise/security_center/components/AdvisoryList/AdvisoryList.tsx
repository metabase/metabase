import cx from "classnames";
import { t } from "ttag";

import AdvisoriesEmpty from "assets/img/shield-96x96.svg";
import { Badge, Box, Button, Card, Group, Text, Title } from "metabase/ui";
import type { Advisory, AdvisoryId } from "metabase-types/api";

import { isAcknowledged, sortAdvisories } from "../../utils";
import { AdvisoryCard } from "../AdvisoryCard/AdvisoryCard";

import S from "./AdvisoryList.module.css";

interface AdvisoryListProps {
  advisories: Advisory[];
  onAcknowledge?: (advisoryId: AdvisoryId) => void;
  onAcknowledgeAll?: (advisoryIds: AdvisoryId[]) => void;
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
  onAcknowledgeAll,
  className,
}: AdvisoryListProps) {
  const { affecting, notAffecting } = sortAdvisories(advisories);
  const undismissedNotAffecting = notAffecting.filter(
    (a) => !isAcknowledged(a),
  );

  if (advisories.length === 0) {
    return (
      <Card className={cx(className, S.root, S.emptyRoot)}>
        <img src={AdvisoriesEmpty} />
        <Text maw={256} ta="center">
          {
            // eslint-disable-next-line no-literal-metabase-strings -- Metabase settings
            t`No known security issues that impact your Metabase version`
          }
        </Text>
      </Card>
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
          <Group align="normal">
            <Title order={4} mb="md">
              {t`Other alerts`}
            </Title>
            {onAcknowledgeAll && undismissedNotAffecting.length > 0 && (
              <Button
                variant="subtle"
                size="compact-xs"
                onClick={() =>
                  onAcknowledgeAll(
                    undismissedNotAffecting.map((a) => a.advisory_id),
                  )
                }
              >{t`Dismiss all`}</Button>
            )}
          </Group>
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
