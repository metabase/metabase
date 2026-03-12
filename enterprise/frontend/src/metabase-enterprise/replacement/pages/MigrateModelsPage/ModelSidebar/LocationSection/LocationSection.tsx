import { Link } from "react-router";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { Anchor, FixedSizeIcon, Group } from "metabase/ui";
import type { SearchResult } from "metabase-types/api";

type LocationSectionProps = {
  result: SearchResult;
};

export function LocationSection({ result }: LocationSectionProps) {
  return (
    <div role="region" aria-label={t`Location`}>
      <Anchor
        component={Link}
        lh="1rem"
        to={Urls.collection(result.collection)}
      >
        <Group gap="sm" wrap="nowrap">
          <FixedSizeIcon name="folder" />
          {result.collection.name}
        </Group>
      </Anchor>
    </div>
  );
}
