import { useState } from "react";
import { t } from "ttag";
import { Divider, Tabs } from "metabase/ui";
import {
  useDatabaseListQuery,
  useSearchListQuery,
} from "metabase/common/hooks";
import type { SearchResult } from "metabase-types/api";
import { BrowseModels } from "../containers/BrowseModels";
import { BrowseDatabases, isValidTabId } from "../containers/BrowseData";
import {
  BrowseContainer,
  BrowseTabs,
  BrowseTabsPanel,
} from "../containers/BrowseData.styled";
import BrowseHeader from "./BrowseHeader";
import { BrowseAppRoot } from "./BrowseApp.styled";

type BrowseTabId = "models" | "databases";

export const BrowseApp = ({ children }: { children: React.ReactNode }) => {
  const [currentTabId, setTabId] = useState<BrowseTabId>("models");

  const models = useSearchListQuery<SearchResult>({
    query: {
      models: ["dataset"],
      filter_items_in_personal_collection: "exclude",
    },
  });

  const databases = useDatabaseListQuery();

  children ??=
    currentTabId === "models" ? (
      <BrowseModels key="models" {...models} />
    ) : (
      <BrowseDatabases key="databases" {...databases} />
    );

  return (
    <BrowseAppRoot data-testid="browse-data">
      <BrowseContainer data-testid="data-browser">
        <BrowseHeader />
        <BrowseTabs
          value={currentTabId}
          onTabChange={value => {
            if (isValidTabId(value)) {
              setTabId(value);
            }
          }}
        >
          <Tabs.List>
            <Tabs.Tab key={"models"} value={"models"}>
              {t`Models`}
            </Tabs.Tab>
            <Tabs.Tab key={"databases"} value={"databases"}>
              {t`Databases`}
            </Tabs.Tab>
          </Tabs.List>
          <Divider />
          <BrowseTabsPanel key={currentTabId} value={currentTabId ?? ""}>
            {children}
          </BrowseTabsPanel>
        </BrowseTabs>
      </BrowseContainer>
    </BrowseAppRoot>
  );
};
