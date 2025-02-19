import cx from "classnames";
import { useEffect, useState } from "react";

const initSqlJs = window.initSqlJs;
import { c, t } from "ttag";

import { skipToken, useGetUserQuery } from "metabase/api";
import { SidesheetCardSection } from "metabase/common/components/Sidesheet";
import DateTime from "metabase/components/DateTime";
import Link from "metabase/core/components/Link";
import Styles from "metabase/css/core/index.css";
import { collection as collectionUrl } from "metabase/lib/urls";
import { getUserName } from "metabase/lib/user";
import { DashboardPublicLinkPopover } from "metabase/sharing/components/PublicLinkPopover";
import { Box, FixedSizeIcon, Flex, Text } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import SidebarStyles from "./DashboardInfoSidebar.module.css";

const SqliteGenerator = () => {

  const handleClick = async () => {
      // if (!sql) return;

        // Initialize SQL.js
  const SQL = await initSqlJs({
    // Required to load the wasm binary asynchronously. Of course, you can host it wherever you want
    // You can omit locateFile completely when running in node
    locateFile: file => `https://sql.js.org/dist/${file}`
    });



    // Create a new database
    const db = new SQL.Database();

    // Create a simple table with some data
    db.run(`
      CREATE TABLE test (id INTEGER, name TEXT);
      INSERT INTO test VALUES (1, 'Alice');
      INSERT INTO test VALUES (2, 'Bob');
    `);

    // Export the database as a Uint8Array
    const binaryArray = db.export();

    // Create and download the file
    const blob = new Blob([binaryArray], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'database.db';
    a.click();

    // Cleanup
    URL.revokeObjectURL(url);
    db.close();
  };

  return (
    <button
      className="bg-blue-500 text-white px-4 py-2 rounded"
      onClick={handleClick}
    >
      Download SQLite Database
    </button>
  );
};

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
      <SidesheetCardSection title={t`Download Sqlite`}>
        {creator && (
          <Flex gap="sm" align="top">
            <FixedSizeIcon name="ai" className={SidebarStyles.IconMargin} />
            <Text>
                Download this data as sqlite
            </Text>
            <SqliteGenerator />
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
            <FixedSizeIcon
              name="folder"
              className={SidebarStyles.IconMargin}
              color="var(--mb-color-brand)"
            />
            <div>
              <Text>
                <Link to={collectionUrl(dashboard.collection)} variant="brand">
                  {dashboard.collection?.name}
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
