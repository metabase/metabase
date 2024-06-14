import { t } from "ttag";

import { Card, Title } from "metabase/ui";
import type { SearchResult } from "metabase-types/api";

export function VisualizerUsed({ used }: { used: SearchResult[] | undefined }) {
  return (
    <Card h="100%">
      <Title order={4}>{t`Being used`}</Title>
      {used?.map((item, index) => (
        <div key={index}>{item.name}</div>
      ))}
    </Card>
  );
}
