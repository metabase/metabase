import { t } from "ttag";

import { Link } from "metabase/common/components/Link/Link";
import { UserHasSeen } from "metabase/common/components/UserHasSeen/UserHasSeen";
import { Indicator, Tooltip } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import type { Collection } from "metabase-types/api";

import { CollectionHeaderButton } from "./CollectionHeader.styled";
import { trackEventsClicked } from "./analytics";

interface CollectionTimelineProps {
  collection: Collection;
}

function CollectionTimelineAcknowledgement({
  children,
}: {
  children: (props: { ack: () => void }) => React.ReactNode;
}) {
  return (
    <UserHasSeen id="events-menu">
      {({ hasSeen, ack }) => (
        <Indicator disabled={hasSeen} size={6} offset={6}>
          {children({
            ack: () => {
              trackEventsClicked();
              if (!hasSeen) {
                ack();
              }
            },
          })}
        </Indicator>
      )}
    </UserHasSeen>
  );
}

const CollectionTimeline = ({
  collection,
}: CollectionTimelineProps): JSX.Element => {
  const url = Urls.timelinesInCollection(collection);

  return (
    <CollectionTimelineAcknowledgement>
      {({ ack }) => (
        <Tooltip label={t`Events`} position="bottom">
          <div>
            <CollectionHeaderButton
              as={Link}
              to={url}
              icon="calendar"
              onClick={ack}
            />
          </div>
        </Tooltip>
      )}
    </CollectionTimelineAcknowledgement>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CollectionTimeline;
