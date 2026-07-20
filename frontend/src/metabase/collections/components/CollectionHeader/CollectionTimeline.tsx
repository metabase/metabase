import { t } from "ttag";

import { Link } from "metabase/common/components/Link/Link";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Collection } from "metabase-types/api";

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
        <ActionIcon variant="viewHeader" size="2rem" component={Link} to={url}>
          <Icon name="calendar" />
        </ActionIcon>
      </div>
    </Tooltip>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CollectionTimeline;
