import { t } from "ttag";

import { Link } from "metabase/common/components/Link/Link";
import { UserHasSeen } from "metabase/common/components/UserHasSeen/UserHasSeen";
import { trackSimpleEvent } from "metabase/lib/analytics";
import * as Urls from "metabase/lib/urls";
import { Indicator, Tooltip } from "metabase/ui";
import type { Collection } from "metabase-types/api";

import { CollectionHeaderButton } from "./CollectionHeader.styled";

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
              trackSimpleEvent({
                event: "events_clicked",
                triggered_from: "collection",
              });
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
