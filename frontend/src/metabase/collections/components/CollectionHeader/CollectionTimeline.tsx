import React from "react";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import Icon, { IconWrapper } from "metabase/components/Icon";
import Link from "metabase/core/components/Link/Link";
import Tooltip from "metabase/components/Tooltip";
import { Collection } from "metabase-types/api";

interface CollectionTimelineProps {
  collection: Collection;
}

const CollectionTimeline = ({
  collection,
}: CollectionTimelineProps): JSX.Element => {
  const url = Urls.timelinesInCollection(collection);

  return (
    <Tooltip tooltip={t`Events`}>
      <Link to={url}>
        <IconWrapper>
          <Icon name="calendar" size={20} />
        </IconWrapper>
      </Link>
    </Tooltip>
  );
};

export default CollectionTimeline;
