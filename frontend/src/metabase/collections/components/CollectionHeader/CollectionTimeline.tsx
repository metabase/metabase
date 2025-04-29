import { t } from "ttag";

import Link from "metabase/core/components/Link/Link";
import * as Urls from "metabase/lib/urls";
import { Tooltip } from "metabase/ui";
import type { Collection } from "metabase-types/api";

import { CollectionHeaderButton } from "./CollectionHeader.styled";

interface CollectionTimelineProps {
  collection: Collection;
}

const CollectionTimeline = ({
  collection,
}: CollectionTimelineProps): JSX.Element => {
  const url = Urls.timelinesInCollection(collection);

  return (
    <Tooltip label={t`Events`} position="bottom">
      <div>
        <CollectionHeaderButton as={Link} to={url} icon="calendar" />
      </div>
    </Tooltip>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CollectionTimeline;
