import { t } from "ttag";

import { Link } from "metabase/common/components/Link/Link";
import { Button, Icon, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Collection } from "metabase-types/api";

import S from "./CollectionHeaderButton.module.css";

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
        <Button
          className={S.headerButton}
          variant="subtle"
          component={Link}
          to={url}
          leftSection={<Icon name="calendar" size={20} />}
        />
      </div>
    </Tooltip>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CollectionTimeline;
