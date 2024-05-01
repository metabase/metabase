import { useCallback, useEffect, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import {
  useDatabaseListQuery,
  useSearchListQuery,
} from "metabase/common/hooks";
import Link from "metabase/core/components/Link";
import { useDispatch } from "metabase/lib/redux";
import { PLUGIN_CONTENT_VERIFICATION } from "metabase/plugins";
import type { FlexProps } from "metabase/ui";
import { Flex, Text } from "metabase/ui";
import type { SearchResult } from "metabase-types/api";

import type { ActualModelFilters, BrowseTabId } from "../utils";
import { filterModels, isValidBrowseTab } from "../utils";

import {
  BrowseAppRoot,
  BrowseContainer,
  BrowseDataHeader,
  BrowseTab,
  BrowseTabs,
  BrowseTabsList,
  BrowseTabsPanel,
  LearnAboutDataIcon,
} from "./BrowseApp.styled";
import { BrowseDatabases } from "./BrowseDatabases";
import { BrowseHeaderIconContainer } from "./BrowseHeader.styled";
import { BrowseModels } from "./BrowseModels";

const availableModelFilters = PLUGIN_CONTENT_VERIFICATION.availableModelFilters;

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
  const databasesResult = useDatabaseListQuery();

  useEffect(() => {
    localStorage.setItem("defaultBrowseTab", tab);
  }, [tab]);

  const getInitialModelFilters = () => {
    return _.reduce(
      availableModelFilters,
      (acc, filter, filterName) => {
        const storedFilterStatus = localStorage.getItem(
          `browseFilters.${filterName}`,
        );
        const shouldFilterBeActive =
          storedFilterStatus === null
            ? filter.activeByDefault
            : storedFilterStatus === "on";
        return {
          ...acc,
          [filterName]: shouldFilterBeActive,
        };
      },
      {},
    );
  };

  const [actualModelFilters, setActualModelFilters] =
    useState<ActualModelFilters>(getInitialModelFilters);
  const { data: unfilteredModels = [] } = modelsResult;

  const filteredModels = useMemo(
    () =>
      filterModels(unfilteredModels, actualModelFilters, availableModelFilters),
    [unfilteredModels, actualModelFilters],
  );
  const filteredModelsResult = { ...modelsResult, data: filteredModels };

  const handleModelFilterChange = useCallback(
    (modelFilterName: string, active: boolean) => {
      localStorage.setItem(
        `browseFilters.${modelFilterName}`,
        active ? "on" : "off",
      );
      setActualModelFilters((prev: ActualModelFilters) => {
        return { ...prev, [modelFilterName]: active };
      });
    },
    [setActualModelFilters],
  );

  return (
    <BrowseAppRoot data-testid="browse-app">
      <BrowseContainer>
        <BrowseDataHeader>
          <BrowseSection>
            <h2>{t`Browse data`}</h2>
          </BrowseSection>
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
            <BrowseSection>
              <BrowseTab key={"models"} value={"models"}>
                {t`Models`}
              </BrowseTab>
              <BrowseTab key={"databases"} value={"databases"}>
                {t`Databases`}
              </BrowseTab>
              {tab === "models" && (
                <PLUGIN_CONTENT_VERIFICATION.ModelFilterControls
                  actualModelFilters={actualModelFilters}
                  handleModelFilterChange={handleModelFilterChange}
                />
              )}
              {tab === "databases" && <LearnAboutDataLink />}
            </BrowseSection>
          </BrowseTabsList>
          <BrowseTabsPanel key={tab} value={tab}>
            <BrowseSection direction="column">
              <BrowseTabContent
                tab={tab}
                modelsResult={filteredModelsResult}
                databasesResult={databasesResult}
              >
                {children}
              </BrowseTabContent>
            </BrowseSection>
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
  databasesResult,
}: {
  tab: BrowseTabId;
  children?: React.ReactNode;
  modelsResult: ReturnType<typeof useSearchListQuery<SearchResult>>;
  databasesResult: ReturnType<typeof useDatabaseListQuery>;
}) => {
  if (children) {
    return <>{children}</>;
  }
  if (tab === "models") {
    return <BrowseModels modelsResult={modelsResult} />;
  } else {
    return <BrowseDatabases databasesResult={databasesResult} />;
  }
};

const LearnAboutDataLink = () => (
  <Flex ml="auto" justify="right" align="center" style={{ flexBasis: "40.0%" }}>
    <Link to="reference">
      <BrowseHeaderIconContainer>
        <LearnAboutDataIcon size={14} name="reference" />
        <Text size="md" lh="1" fw="bold" ml=".5rem" c="inherit">
          {t`Learn about our data`}
        </Text>
      </BrowseHeaderIconContainer>
    </Link>
  </Flex>
);

const BrowseSection = (props: FlexProps) => (
  <Flex h="100%" maw="64rem" m="0 auto" w="100%" {...props} />
);
