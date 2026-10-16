import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { useNumberFormatter } from "metabase/common/hooks/use-number-formatter";
import { Card, Stack } from "metabase/ui";
import { getUserName } from "metabase/utils/user";
import type { Document } from "metabase-types/api";

import { InfoItemSection } from "../../../components/InfoItemSection";
import { InfoStatSection } from "../../../components/InfoStatSection";

type DocumentInfoProps = {
  document: Document;
};

export function DocumentInfo({ document }: DocumentInfoProps) {
  const formatNumber = useNumberFormatter();
  const viewCount = document.view_count ?? 0;
  // last_viewed_at defaults to the creation time, so it means nothing until the first view
  const lastViewedAt = viewCount > 0 ? document.last_viewed_at : undefined;

  return (
    <Stack gap={0} align="stretch" data-testid="document-info">
      <Card
        mx="xl"
        mt="xl"
        bg="background_page-secondary"
        shadow="none"
        radius="lg"
      >
        <InfoItemSection
          icon="pencil"
          value={<DateTime value={document.updated_at} />}
          label={t`Last edited`}
        />
        <InfoItemSection
          icon="person"
          value={getUserName(document.creator)}
          label={t`Owner`}
        />
      </Card>
      <Card mx="xl" my="xl" shadow="none">
        <InfoStatSection label={t`Views`} value={formatNumber(viewCount)} />
        <InfoStatSection
          label={t`Last viewed`}
          value={lastViewedAt ? <DateTime value={lastViewedAt} /> : t`Never`}
        />
      </Card>
    </Stack>
  );
}
