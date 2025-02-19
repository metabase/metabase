import cx from "classnames";
import { useState } from "react";
import snake_case from "lodash.snakecase";
import { c, t } from "ttag";
import { match } from "ts-pattern";

import { skipToken, useGetUserQuery } from "metabase/api";
import { SidesheetCardSection } from "metabase/common/components/Sidesheet";
import DateTime from "metabase/components/DateTime";
import Link from "metabase/core/components/Link";
import Styles from "metabase/css/core/index.css";
import { collection as collectionUrl } from "metabase/lib/urls";
import { getUserName } from "metabase/lib/user";
import { DashboardPublicLinkPopover } from "metabase/sharing/components/PublicLinkPopover";
import { Box, FixedSizeIcon, Flex, Text } from "metabase/ui";
import { useSelector } from "metabase/lib/redux";
import { getDashcardDataMap } from "metabase/dashboard/selectors";
import type { Dashboard, Dataset } from "metabase-types/api";

import SidebarStyles from "./DashboardInfoSidebar.module.css";

const initSqlJs = window.initSqlJs;

function download({ filename, blob }: { filename: string; blob: Blob }) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url); // cleanup
}

const openInJupyter = (notebookName: string, jupyterToken: string) => {
  const jupyterUrl = `http://localhost:8888/lab/tree/${notebookName}`;
  const tokenParam = jupyterToken ? `?token=${jupyterToken}` : "";
  window.open(jupyterUrl + tokenParam, "_blank");
};

const generateNotebookContent = ({ dbPath }: { dbPath: string }) => {
  const notebook = {
    cells: [
      {
        cell_type: "code",
        execution_count: null,
        metadata: {},
        outputs: [],
        source: [
          "import sqlite3\n",
          "import pandas as pd\n",
          "\n",
          "# Connect to the database\n",
          `print(f'Connecting to database: {repr("${dbPath}")}')\n`,
          `conn = sqlite3.connect('${dbPath}')\n`,
          "\n",
          "# List all tables\n",
          "cursor = conn.cursor()\n",
          "cursor.execute(\"SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%';\")\n",
          "tables = [row[0] for row in cursor.fetchall()]\n",
          "\n",
          "print('\\nAvailable tables:')\n",
          "for table in tables:\n",
          '    cursor.execute(f"SELECT COUNT(*) FROM {table}")\n',
          "    count = cursor.fetchone()[0]\n",
          '    print(f"- {table} ({count} rows)")\n',
          "\n",
          "if tables:\n",
          "    print('\\nFirst table preview:')\n",
          "    first_table = tables[0]\n",
          "    \n",
          "    # Get schema\n",
          "    cursor.execute(f\"SELECT sql FROM sqlite_schema WHERE type='table' AND name=?\", (first_table,))\n",
          "    schema = cursor.fetchone()[0]\n",
          "    print(f'\\nSchema:\\n{schema}')\n",
          "    \n",
          "    # Get data preview\n",
          "    df = pd.read_sql_query(f'SELECT * FROM {first_table} LIMIT 5', conn)\n",
          "    display(df)\n",
          "else:\n",
          "    print('No tables found in database')\n",
        ],
      },
    ],
    metadata: {
      kernelspec: {
        display_name: "Python 3",
        language: "python",
        name: "python3",
      },
    },
    nbformat: 4,
    nbformat_minor: 4,
  };

  return JSON.stringify(notebook, null, 2);
};

const sqlFriendlyName = (str: string) =>
  snake_case(str.replace(/[^a-zA-Z\s]/g, ""));

const SqliteGenerator = ({ dashboard }: { dashboard: Dashboard }) => {
  const dashboardData = useSelector(getDashcardDataMap);

  const handleClick = async () => {
    const results = Object.values(dashboardData)
      .map(kv => Object.entries(kv)?.[0])
      .filter(([, x]) => !!x) as [string, Dataset][];

    const sqliteData = results
      .map(([cardId, result], index) => {
        const relatedCard = dashboard.dashcards.find(
          dc => dc.card.id === parseInt(cardId, 10),
        )?.card;
        const tableName = sqlFriendlyName(
          relatedCard?.name ?? `table_${index}`,
        );

        const columns = result.data.cols.map(col => {
          const sqliteType = match(col.base_type)
            .with("type/Date", () => "DATE")
            .with("type/DateTime", () => "DATETIME")
            .with("type/Float", () => "REAL")
            .with("type/Integer", () => "INTEGER")
            .with("type/BigInteger", () => "INTEGER")
            .otherwise(() => "TEXT");
          return `"${sqlFriendlyName(col.display_name)}" ${sqliteType}`;
        });

        const table = `CREATE TABLE ${tableName} (${columns.join(", ")});`;

        const rows = result.data.rows
          .map(row => `(${row.map(val => JSON.stringify(val)).join(", ")})`)
          .join(",\n");

        const data = `INSERT INTO ${tableName}\nVALUES ${rows};`;

        return [table, data].join("\n");
      })
      .join("\n");

    // if (!sql) return;

    // Initialize SQL.js
    const SQL = await initSqlJs({
      // Required to load the wasm binary asynchronously. Of course, you can host it wherever you want
      // You can omit locateFile completely when running in node
      locateFile: file => `https://sql.js.org/dist/${file}`,
    });

    // Create a new database
    const db = new SQL.Database();

    // Create a simple table with some data
    db.run(sqliteData);

    // Export the database as a Uint8Array
    const binaryArray = db.export();
    const sqliteFilename = `${sqlFriendlyName(dashboard.name)}_${new Date().getTime()}.db`;
    download({
      filename: sqliteFilename,
      blob: new Blob([binaryArray], { type: "application/x-sqlite3" }),
    });
    download({
      filename: "analyze_sqlite.ipynb",
      blob: new Blob([generateNotebookContent({ dbPath: sqliteFilename })], {
        type: "application/json",
      }),
    });
    // NOTE: delete this if you don't want it
    openInJupyter("analyze_sqlite.ipynb", "");
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
            <Text>Download this data as sqlite</Text>
            <SqliteGenerator dashboard={dashboard} />
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
