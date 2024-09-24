import cx from "classnames";
import { useState } from "react";
import { c, t } from "ttag";

import { skipToken, useGetUserQuery } from "metabase/api";
import { getCollectionName } from "metabase/collections/utils";
import { SidesheetCardSection } from "metabase/common/components/Sidesheet";
import DateTime from "metabase/components/DateTime";
import Link from "metabase/core/components/Link";
import Styles from "metabase/css/core/index.css";
import * as Urls from "metabase/lib/urls";
import { getUserName } from "metabase/lib/user";
import { PLUGIN_COLLECTION_COMPONENTS } from "metabase/plugins";
import { DashboardPublicLinkPopover } from "metabase/sharing/components/PublicLinkPopover";
import { Box, FixedSizeIcon, Flex, Text } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import SidebarStyles from "./DashboardInfoSidebar.module.css";

export const DashboardDetails = ({ dashboard }: { dashboard: Dashboard }) => {
  const lastEditInfo = dashboard["last-edit-info"];
  const createdAt = dashboard.created_at;

  // we don't hydrate creator user info on the dashboard object
  const { data: creator } = useGetUserQuery(dashboard.creator_id ?? skipToken);

  return (
    <>
      <SidesheetCardSection title={t`Creator and last editor`}>
        {creator && (
          <Flex gap="sm" align="top">
            <FixedSizeIcon name="ai" className={SidebarStyles.IconMargin} />
            <Text>
              {c(
                "Describes when a dashboard was created. {0} is a date/time and {1} is a person's name",
              ).jt`${(
                <DateTime unit="day" value={createdAt} key="date" />
              )} by ${getUserName(creator)}`}
            </Text>
          </Flex>
        )}

        {lastEditInfo && (
          <Flex gap="sm" align="top">
            <FixedSizeIcon name="pencil" className={SidebarStyles.IconMargin} />
            <Text>
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
          </Flex>
        )}
      </SidesheetCardSection>
      {dashboard.collection && (
        <SidesheetCardSection
          title={c(
            "This is a heading that appears above the name of a collection - a collection that a dashboard is saved in. Feel free to translate this heading as though it said 'Saved in collection', if you think that would make more sense in your language.",
          ).t`Saved in`}
        >
          <Flex gap="sm" align="top">
            <PLUGIN_COLLECTION_COMPONENTS.CollectionAuthorityLevelIcon
              collection={dashboard.collection}
              className={SidebarStyles.IconMargin}
              showIconForRegularCollection
            />
            <div>
              <Text>
                <Link
                  to={Urls.collection(dashboard.collection)}
                  variant="brand"
                >
                  {getCollectionName(dashboard.collection)}
                </Link>
              </Text>
            </div>
          </Flex>
        </SidesheetCardSection>
      )}
      <SharingDisplay dashboard={dashboard} />
    </>
  );
};

function SharingDisplay({ dashboard }: { dashboard: Dashboard }) {
  const publicUUID = dashboard.public_uuid;
  const embeddingEnabled = dashboard.enable_embedding;
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  if (!publicUUID && !embeddingEnabled) {
    return null;
  }

  return (
    <SidesheetCardSection title={t`Visibility`}>
      {publicUUID && (
        <Flex gap="sm" align="center">
          <FixedSizeIcon name="globe" color="var(--mb-color-brand)" />
          <Text>{t`Shared publicly`}</Text>

          <DashboardPublicLinkPopover
            target={
              <FixedSizeIcon
                name="link"
                onClick={() => setIsPopoverOpen(prev => !prev)}
                className={cx(
                  Styles.cursorPointer,
                  Styles.textBrandHover,
                  SidebarStyles.IconMargin,
                )}
              />
            }
            isOpen={isPopoverOpen}
            onClose={() => setIsPopoverOpen(false)}
            dashboard={dashboard}
          />
        </Flex>
      )}
      {embeddingEnabled && (
        <Flex gap="sm" align="center">
          <Box className={SidebarStyles.BrandCircle}>
            <FixedSizeIcon name="embed" size="14px" />
          </Box>
          <Text>{t`Embedded`}</Text>
        </Flex>
      )}
    </SidesheetCardSection>
  );
}
