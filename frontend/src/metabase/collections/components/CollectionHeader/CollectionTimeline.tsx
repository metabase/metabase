import { t } from "ttag";

import type { Collection } from "metabase-types/api";
import { Link } from "metabase/common/components/Link/Link";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";

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
