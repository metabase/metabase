import React from "react";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import Link from "metabase/core/components/Link/Link";
import Tooltip from "metabase/components/Tooltip";
import { Collection } from "metabase-types/api";
import { CollectionHeaderButton } from "./CollectionHeader.styled";

interface CollectionTimelineProps {
  collection: Collection;
}

const CollectionTimeline = ({
  collection,
}: CollectionTimelineProps): JSX.Element => {
  const url = Urls.timelinesInCollection(collection);

  return (
    <Link to={url} tabIndex={-1}>
      <Tooltip tooltip={t`Events`}>
        <CollectionHeaderButton icon="calendar" iconSize={20} onlyIcon />
      </Tooltip>
    </Link>
  );
};

export default CollectionTimeline;
