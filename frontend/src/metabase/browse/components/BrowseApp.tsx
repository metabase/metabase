import { t } from "ttag";
import { push } from "react-router-redux";
import { Divider, Tabs } from "metabase/ui";
import {
  useDatabaseListQuery,
  useSearchListQuery,
} from "metabase/common/hooks";
import type { SearchResult } from "metabase-types/api";
import { useDispatch } from "metabase/lib/redux";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { BrowseDatabases, isValidBrowseTab } from "../containers/BrowseData";
import {
  BrowseContainer,
  BrowseDataHeader,
  BrowseTabs,
  BrowseTabsPanel,
} from "../containers/BrowseData.styled";
import { BrowseModels } from "../containers/BrowseModels";
import { BrowseAppRoot } from "./BrowseApp.styled";

export const BrowseApp = ({
  tab = "models",
  children,
}: {
  tab?: string;
  children?: React.ReactNode;
}) => {
  const dispatch = useDispatch();

  const modelsResult = useSearchListQuery<SearchResult>({
    query: {
      models: ["dataset"],
      filter_items_in_personal_collection: "exclude",
    },
  });
  const databasesResult = useDatabaseListQuery();

  if (!isValidBrowseTab(tab)) {
    return <LoadingAndErrorWrapper error />;
  }

  return (
    <BrowseAppRoot data-testid="browse-data">
      <BrowseContainer data-testid="data-browser">
        <BrowseDataHeader>{t`Browse data`}</BrowseDataHeader>
        <BrowseTabs
          value={tab}
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
          <BrowseTabsPanel key={tab} value={tab ?? ""}>
            {children ||
              (tab === "models" ? (
                <BrowseModels modelsResult={modelsResult} />
              ) : (
                <BrowseDatabases databasesResult={databasesResult} />
              ))}
          </BrowseTabsPanel>
        </BrowseTabs>
      </BrowseContainer>
    </BrowseAppRoot>
  );
};
