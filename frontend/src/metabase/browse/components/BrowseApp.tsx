import { useCallback, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";
import type { SearchResult } from "metabase-types/api";
import {
  useCollectionListQuery,
  useDatabaseListQuery,
  useSearchListQuery,
} from "metabase/common/hooks";
import { useDispatch } from "metabase/lib/redux";
import { Flex, Icon, Text } from "metabase/ui";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Link from "metabase/core/components/Link";
import { PLUGIN_CONTENT_VERIFICATION } from "metabase/plugins";
import type { BrowseFilters } from "../utils";
import { isValidBrowseTab, type BrowseTabId } from "../utils";
import {
  BrowseAppRoot,
  BrowseContainer,
  BrowseDataHeader,
  BrowseTab,
  BrowseTabs,
  BrowseTabsList,
  BrowseTabsPanel,
} from "./BrowseApp.styled";
import { BrowseDatabases } from "./BrowseDatabases";
import { BrowseHeaderIconContainer } from "./BrowseHeader.styled";
import { BrowseModels } from "./BrowseModels";

export const BrowseApp = ({
  tab,
  children,
}: {
  tab: BrowseTabId;
  children?: React.ReactNode;
}) => {
  const dispatch = useDispatch();
  const modelsResult = useSearchListQuery<SearchResult>({
    query: {
      models: ["dataset"],
      filter_items_in_personal_collection: "exclude",
    },
  });
  const collectionsResult = useCollectionListQuery();
  const databasesResult = useDatabaseListQuery();

  const initialFilters = PLUGIN_CONTENT_VERIFICATION.browseFilters;

  for (const [filterName, filter] of Object.entries(initialFilters)) {
    const storedValue = localStorage.getItem(`browseFilters.${filterName}`);
    if (storedValue !== null) {
      filter.active = storedValue === "on";
    }
  }

  const [filters, setFilters] = useState(initialFilters);

  const setFilter = useCallback(
    (filterName: string, active: boolean) => {
      setFilters((previousFilters: BrowseFilters) => {
        const newFilters = { ...previousFilters };
        newFilters[filterName].active = active;
        return newFilters;
      });
      localStorage.setItem(
        `browseFilters.${filterName}`,
        active ? "on" : "off",
      );
    },
    [setFilters],
  );

  if (!isValidBrowseTab(tab)) {
    return <LoadingAndErrorWrapper error />;
  }

  return (
    <BrowseAppRoot data-testid="browse-app">
      <BrowseContainer>
        <BrowseDataHeader>
          <Flex maw="1014px" m="0 auto" w="100%" align="center">
            <h2>{t`Browse data`}</h2>
          </Flex>
        </BrowseDataHeader>
        <BrowseTabs
          value={tab}
          onTabChange={value => {
            if (isValidBrowseTab(value)) {
              dispatch(push(`/browse/${value}`));
            }
          }}
        >
          <BrowseTabsList>
            <Flex maw="1014px" m="0 auto" w="100%" align="center">
              <BrowseTab key={"models"} value={"models"}>
                {t`Models`}
              </BrowseTab>
              <BrowseTab key={"databases"} value={"databases"}>
                {t`Databases`}
              </BrowseTab>
              {tab === "models" ? (
                <PLUGIN_CONTENT_VERIFICATION.BrowseFilterControls
                  filters={filters}
                  setFilter={setFilter}
                />
              ) : (
                <Flex ml="auto" justify="right" style={{ flexBasis: "40.0%" }}>
                  <Link to="reference">
                    <BrowseHeaderIconContainer>
                      <Icon size={14} name="reference" />
                      <Text size="md" lh="1" fw="bold" ml=".5rem" c="inherit">
                        {t`Learn about our data`}
                      </Text>
                    </BrowseHeaderIconContainer>
                  </Link>
                </Flex>
              )}
            </Flex>
          </BrowseTabsList>
          <BrowseTabsPanel key={tab} value={tab}>
            <Flex
              maw="1014px"
              m="0 auto"
              w="100%"
              align="center"
              direction="column"
              justify="flex-start"
            >
              <BrowseTabContent
                tab={tab}
                modelsResult={modelsResult}
                collectionsResult={collectionsResult}
                databasesResult={databasesResult}
                filters={filters}
              >
                {children}
              </BrowseTabContent>
            </Flex>
          </BrowseTabsPanel>
        </BrowseTabs>
      </BrowseContainer>
    </BrowseAppRoot>
  );
};

const BrowseTabContent = ({
  tab,
  children,
  modelsResult,
  collectionsResult,
  databasesResult,
  filters,
}: {
  tab: BrowseTabId;
  children?: React.ReactNode;
  modelsResult: ReturnType<typeof useSearchListQuery<SearchResult>>;
  collectionsResult: ReturnType<typeof useCollectionListQuery>;
  databasesResult: ReturnType<typeof useDatabaseListQuery>;
  filters: BrowseFilters;
}) => {
  if (children) {
    return <>{children}</>;
  }
  if (tab === "models") {
    return (
      <BrowseModels
        modelsResult={modelsResult}
        collectionsResult={collectionsResult}
        filters={filters}
      />
    );
  } else {
    return <BrowseDatabases databasesResult={databasesResult} />;
  }
};
