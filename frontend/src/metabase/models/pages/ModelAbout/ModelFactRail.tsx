import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import {
  FactCard,
  FactRow,
  FactRowLink,
  FactSection,
  MaintainerFact,
} from "metabase/common/components/EntityFactRail";
import { Markdown } from "metabase/common/components/Markdown";
import { Stack, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Card } from "metabase-types/api";

export type ModelFactRailProps = {
  card: Card;
};

export function ModelFactRail({ card }: ModelFactRailProps) {
  return (
    <Stack gap="lg" data-testid="model-fact-rail">
      <Text fw="bold">{t`About`}</Text>
      <Text size="sm" c="text-secondary">
        {t`Last updated`} <DateTime unit="day" value={card.updated_at} />
      </Text>
      {/* Read-only: model description editing lives in the query-builder sidesheet. */}
      <Markdown>{card.description || t`No description`}</Markdown>
      <MaintainerFact
        creator={card.creator}
        createdAt={card.created_at}
        lastEditInfo={card["last-edit-info"]}
      />
      {card.collection && (
        <FactSection title={t`Saved in`}>
          <FactCard>
            <FactRow icon="folder">
              <FactRowLink to={Urls.collection(card.collection)}>
                {card.collection.name}
              </FactRowLink>
            </FactRow>
          </FactCard>
        </FactSection>
      )}
    </Stack>
  );
}
