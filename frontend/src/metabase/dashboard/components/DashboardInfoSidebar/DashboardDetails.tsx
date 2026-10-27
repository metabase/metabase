import cx from "classnames";
import { useState } from "react";
import { c, t } from "ttag";

import { skipToken, useGetUserQuery } from "metabase/api";
import { DateTime } from "metabase/common/components/DateTime";
import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { Link } from "metabase/common/components/Link";
import Styles from "metabase/css/core/index.css";
import { FixedSizeIcon, Group, Stack, Text } from "metabase/ui";
import { collection as collectionUrl } from "metabase/urls";
import { getUserName } from "metabase/utils/user";
import type { Dashboard } from "metabase-types/api";

import { DashboardPublicLinkPopover } from "./DashboardPublicLinkPopover/DashboardPublicLinkPopover";

export const DashboardDetails = ({ dashboard }: { dashboard: Dashboard }) => {
  const lastEditInfo = dashboard["last-edit-info"];
  const createdAt = dashboard.created_at;

  // we don't hydrate creator user info on the dashboard object
  const { data: creator } = useGetUserQuery(dashboard.creator_id ?? skipToken);

  return (
    <SidebarSection title={t`Details`}>
      <DetailsTable>
        {creator && (
          <DetailsRow
            label={t`Created`}
            value={
              <Text c="text-primary">
                {c(
                  "Describes when a dashboard was created. {0} is a date/time and {1} is a person's name",
                ).jt`${(
                  <DateTime unit="day" value={createdAt} key="date" />
                )} by ${getUserName(creator)}`}
              </Text>
            }
          />
        )}
        {lastEditInfo && (
          <DetailsRow
            label={t`Last edited`}
            value={
              <Text c="text-primary">
                {c(
                  "Describes when a dashboard was last edited. {0} is a date/time and {1} is a person's name",
                ).jt`${(
                  <DateTime
                    unit="day"
                    value={lastEditInfo.timestamp}
                    key="date"
                  />
                )} by ${getUserName(lastEditInfo)}`}
              </Text>
            }
          />
        )}
        {dashboard.collection && (
          <DetailsRow
            label={c(
              "This is a heading that appears above the name of a collection - a collection that a dashboard is saved in. Feel free to translate this heading as though it said 'Saved in collection', if you think that would make more sense in your language.",
            ).t`Saved in`}
            value={
              <Link to={collectionUrl(dashboard.collection)} variant="brand">
                {dashboard.collection.name}
              </Link>
            }
          />
        )}
        <VisibilityRow dashboard={dashboard} />
      </DetailsTable>
    </SidebarSection>
  );
};

function VisibilityRow({ dashboard }: { dashboard: Dashboard }) {
  const publicUUID = dashboard.public_uuid;
  const embeddingEnabled = dashboard.enable_embedding;
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  if (!publicUUID && !embeddingEnabled) {
    return null;
  }

  return (
    <DetailsRow
      label={t`Visibility`}
      value={
        <Stack gap="xs">
          {publicUUID && (
            <Group gap="sm" wrap="nowrap">
              <Text c="text-primary">{t`Shared publicly`}</Text>
              <DashboardPublicLinkPopover
                target={
                  <FixedSizeIcon
                    name="link"
                    onClick={() => setIsPopoverOpen((prev) => !prev)}
                    className={cx(Styles.cursorPointer, Styles.textBrandHover)}
                  />
                }
                isOpen={isPopoverOpen}
                onClose={() => setIsPopoverOpen(false)}
                dashboard={dashboard}
              />
            </Group>
          )}
          {embeddingEnabled && <Text c="text-primary">{t`Embedded`}</Text>}
        </Stack>
      }
    />
  );
}
