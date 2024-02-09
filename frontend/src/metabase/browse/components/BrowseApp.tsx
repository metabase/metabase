import { t } from "ttag";
import { push } from "react-router-redux";
import { useState } from "react";
import { Flex, Icon, Switch, Text } from "metabase/ui";
import {
  useDatabaseListQuery,
  useSearchListQuery,
} from "metabase/common/hooks";
import type { SearchResult } from "metabase-types/api";
import { useDispatch } from "metabase/lib/redux";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Link from "metabase/core/components/Link";
import { isValidBrowseTab, type BrowseTabId } from "../utils";
import { BrowseDatabases } from "./BrowseDatabases";
import { BrowseModels } from "./BrowseModels";
import {
  BrowseAppRoot,
  BrowseContainer,
  BrowseDataHeader,
  BrowseTab,
  BrowseTabs,
  BrowseTabsList,
  BrowseTabsPanel,
} from "./BrowseApp.styled";
import { BrowseHeaderIconContainer } from "./BrowseHeader.styled";

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

  const [onlyShowVerifiedModels, setOnlyShowVerifiedModels] = useState(
    localStorage.getItem("onlyShowVerifiedModelsInBrowseData") !== "false",
  );

  const changeOnlyShowVerifiedModels = (newValue: boolean) => {
    localStorage.setItem(
      "onlyShowVerifiedModelsInBrowseData",
      newValue ? "true" : "false",
    );
    setOnlyShowVerifiedModels(newValue);
  };

  if (!isValidBrowseTab(tab)) {
    return <LoadingAndErrorWrapper error />;
  }

  // If no children specified, use the tab id to determine what to show inside the tab
  if (!children) {
    if (tab === "models") {
      children = (
        <BrowseModels
          modelsResult={modelsResult}
          onlyShowVerifiedModels={onlyShowVerifiedModels}
        />
      );
    }
    if (tab === "databases") {
      children = <BrowseDatabases databasesResult={databasesResult} />;
    }
  }

  return (
    <BrowseAppRoot data-testid="browse-app">
      <BrowseContainer>
        <BrowseDataHeader>
          <Flex maw="1014px" m="0 auto" w="100%" align="center">
            <h2>{t`Browse data`}</h2>
            {tab === "databases" && (
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
                <Switch
                  ml="auto"
                  size="sm"
                  labelPosition="left"
                  checked={onlyShowVerifiedModels}
                  label={<strong>{t`Only show verified models`}</strong>}
                  onChange={e => {
                    changeOnlyShowVerifiedModels(e.target.checked);
                  }}
                />
              ) : (
                <div className="flex flex-align-right">
                  <Link className="flex flex-align-right" to="reference">
                    <BrowseHeaderIconContainer>
                      <Icon
                        className="flex align-center"
                        size={14}
                        name="reference"
                      />
                      <Text
                        size="md"
                        lh="1"
                        className="ml1 flex align-center text-bold"
                      >
                        {t`Learn about our data`}
                      </Text>
                    </BrowseHeaderIconContainer>
                  </Link>
                </div>
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
              {children}
            </Flex>
          </BrowseTabsPanel>
        </BrowseTabs>
      </BrowseContainer>
    </BrowseAppRoot>
  );
};
