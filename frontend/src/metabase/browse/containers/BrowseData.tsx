import { useState } from "react";

import _ from "underscore";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { color } from "metabase/lib/colors";

import { Divider, Flex, Tabs, Icon } from "metabase/ui";
import { Grid } from "metabase/components/Grid";
import Link from "metabase/core/components/Link";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import {
  useDatabaseListQuery,
  useSearchListQuery,
} from "metabase/common/hooks";

import { ANALYTICS_CONTEXT } from "metabase/browse/constants";

import NoResults from "assets/img/no_results.svg";
import BrowseHeader from "../components/BrowseHeader";
import {
  DatabaseCard,
  DatabaseGridItem,
  BrowseContainer,
  BrowseTabs,
  BrowseTabsPanel,
  CenteredEmptyState,
} from "./BrowseData.styled";
import { BrowseModels } from "./BrowseModels";

interface BrowseDataTab {
  label: string;
  component: JSX.Element;
}

export const BrowseDataPage = () => {
  const [currentTabId, setTabId] = useState<string | null>("models");

  const models = useSearchListQuery({
    query: {
      models: ["dataset"],
    },
    reload: true,
  });
  const databases = useDatabaseListQuery({
    reload: true,
  });

  const tabs: Record<string, BrowseDataTab> = {
    models: {
      label: t`Models`,
      component: <BrowseModels data={models} />,
    },
    databases: {
      label: t`Databases`,
      component: <BrowseDatabases data={databases} />,
    },
  };
  const currentTab = currentTabId ? tabs[currentTabId] : null;
  // TODO: "Learn about our data" goes off screen when viewport is narrow
  return (
    <BrowseContainer data-testid="data-browser">
      <BrowseHeader />
      <BrowseTabs value={currentTabId} onTabChange={setTabId}>
        <Flex>
          <Tabs.List>
            {Object.entries(tabs).map(([tabId, tab]) => (
              <Tabs.Tab key={tabId} value={tabId}>
                {tab.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Flex>
        <Divider />
        {currentTab && (
          <BrowseTabsPanel key={currentTabId} value={currentTabId ?? ""}>
            {currentTab.component}
          </BrowseTabsPanel>
        )}
      </BrowseTabs>
    </BrowseContainer>
  );
};

// NOTE: The minimum mergeable version does not need to include the verified badges

const BrowseDatabases = ({
  data,
}: {
  data: ReturnType<typeof useDatabaseListQuery>;
}) => {
  const { data: databases = [], error, isLoading } = data;

  if (error) {
    return <LoadingAndErrorWrapper error />;
  } else if (isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  // TODO: Virtualize this list too?
  return databases.length ? (
    <Grid data-testid="database-browser">
      {databases.map(database => (
        <DatabaseGridItem key={database.id}>
          <Link
            to={Urls.browseDatabase(database)}
            data-metabase-event={`${ANALYTICS_CONTEXT};Database Click`}
          >
            <DatabaseCard>
              <Icon
                name="database"
                color={color("accent2")}
                className="mb3"
                size={32}
              />
              <h3 className="text-wrap">{database.name}</h3>
            </DatabaseCard>
          </Link>
        </DatabaseGridItem>
      ))}
    </Grid>
  ) : (
    <CenteredEmptyState
      title={t`No databases here yet`}
      illustrationElement={<img src={NoResults} />}
    />
  );
};
