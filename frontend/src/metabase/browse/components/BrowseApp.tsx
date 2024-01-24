import type { ReactElement } from "react";
import { cloneElement, isValidElement } from "react";
import { t } from "ttag";
import { push } from "react-router-redux";
import { useLocation } from "react-use";
import { Divider, Tabs } from "metabase/ui";
import {
  useDatabaseListQuery,
  useSearchListQuery,
} from "metabase/common/hooks";
import type { SearchResult } from "metabase-types/api";
import { useDispatch } from "metabase/lib/redux";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { isValidBrowseTab } from "../containers/BrowseData";
import {
  BrowseContainer,
  BrowseDataHeader,
  BrowseTabs,
  BrowseTabsPanel,
} from "../containers/BrowseData.styled";
import { BrowseAppRoot } from "./BrowseApp.styled";

type BrowseTabProps = {
  modelsResult?: ReturnType<typeof useSearchListQuery<SearchResult>>;
  databasesResult?: ReturnType<typeof useDatabaseListQuery>;
};

export const BrowseApp = ({ children }: { children: React.ReactNode }) => {
  const dispatch = useDispatch();

  const location = useLocation();
  const currentTab = location.pathname?.split("/")[2] || "models";

  const modelsResult = useSearchListQuery<SearchResult>({
    query: {
      models: ["dataset"],
      filter_items_in_personal_collection: "exclude",
    },
  });
  const databasesResult = useDatabaseListQuery();

  if (!isValidBrowseTab(currentTab)) {
    return <LoadingAndErrorWrapper error />;
  }

  return (
    <BrowseAppRoot data-testid="browse-data">
      <BrowseContainer data-testid="data-browser">
        <BrowseDataHeader>{t`Browse data`}</BrowseDataHeader>
        <BrowseTabs
          value={currentTab}
          onTabChange={value => {
            if (isValidBrowseTab(value)) {
              dispatch(push(`/browse/${value}`));
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
          <BrowseTabsPanel key={currentTab} value={currentTab ?? ""}>
            {isValidElement(children) &&
              cloneElement(children as ReactElement<BrowseTabProps>, {
                modelsResult,
                databasesResult,
              })}
          </BrowseTabsPanel>
        </BrowseTabs>
      </BrowseContainer>
    </BrowseAppRoot>
  );
};
