import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import NoResults from "assets/img/no_results.svg";
import { useSearchQuery } from "metabase/api";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { color } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_CONTENT_VERIFICATION } from "metabase/plugins";
import { getLocale } from "metabase/setup/selectors";
import { Box, Flex, Group, Icon, Stack, Title } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

import { BROWSE_MODELS_LOCALSTORAGE_KEY } from "../constants";
import {
  filterModels,
  getCollectionViewPreferences,
  groupModels,
  type ActualModelFilters,
} from "../utils";

import {
  BrowseContainer,
  BrowseHeader,
  BrowseMain,
  BrowseSection,
  CenteredEmptyState,
} from "./BrowseApp.styled";
import { ModelGrid } from "./BrowseModels.styled";
import { ModelExplanationBanner } from "./ModelExplanationBanner";
import { ModelGroup } from "./ModelGroup";

const { availableModelFilters } = PLUGIN_CONTENT_VERIFICATION;

export const BrowseModels = () => {
  const getInitialModelFilters = useCallback(() => {
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
  }, []);

  const [actualModelFilters, setActualModelFilters] =
    useState<ActualModelFilters>({});

  useEffect(() => {
    const initialModelFilters = getInitialModelFilters();
    setActualModelFilters(initialModelFilters);
  }, [getInitialModelFilters, setActualModelFilters]);

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
    <BrowseContainer>
      <BrowseHeader>
        <BrowseSection>
          <Flex w="100%" direction="row" justify="space-between" align="center">
            <Title order={1} color="text-dark">
              <Group spacing="sm">
                <Icon size={18} color={color("brand")} name="model" />
                {t`Models`}
              </Group>
            </Title>
            <PLUGIN_CONTENT_VERIFICATION.ModelFilterControls
              actualModelFilters={actualModelFilters}
              handleModelFilterChange={handleModelFilterChange}
            />
          </Flex>
        </BrowseSection>
      </BrowseHeader>
      <BrowseMain>
        <BrowseSection>
          <BrowseModelsBody actualModelFilters={actualModelFilters} />
        </BrowseSection>
      </BrowseMain>
    </BrowseContainer>
  );
};

export const BrowseModelsBody = ({
  actualModelFilters,
}: {
  actualModelFilters: ActualModelFilters;
}) => {
  const { data, error, isLoading } = useSearchQuery({
    models: ["dataset"],
    filter_items_in_personal_collection: "exclude",
  });
  const unfilteredModels = data?.data;
  const locale = useSelector(getLocale);
  const localeCode: string | undefined = locale?.code;
  const [collectionViewPreferences, setCollectionViewPreferences] = useState(
    getCollectionViewPreferences,
  );

  const models = useMemo(
    () =>
      filterModels(
        unfilteredModels || [],
        actualModelFilters,
        availableModelFilters,
      ),
    [unfilteredModels, actualModelFilters],
  );

  const handleToggleCollectionExpand = (collectionId: CollectionId) => {
    const newPreferences = {
      ...collectionViewPreferences,
      [collectionId]: {
        expanded: !(
          collectionViewPreferences?.[collectionId]?.expanded ?? true
        ),
        showAll: !!collectionViewPreferences?.[collectionId]?.showAll,
      },
    };
    setCollectionViewPreferences(newPreferences);
    localStorage.setItem(
      BROWSE_MODELS_LOCALSTORAGE_KEY,
      JSON.stringify(newPreferences),
    );
  };

  const handleToggleCollectionShowAll = (collectionId: CollectionId) => {
    const newPreferences = {
      ...collectionViewPreferences,
      [collectionId]: {
        expanded: collectionViewPreferences?.[collectionId]?.expanded ?? true,
        showAll: !collectionViewPreferences?.[collectionId]?.showAll,
      },
    };
    setCollectionViewPreferences(newPreferences);
    localStorage.setItem(
      BROWSE_MODELS_LOCALSTORAGE_KEY,
      JSON.stringify(newPreferences),
    );
  };

  if (error || isLoading) {
    return (
      <LoadingAndErrorWrapper
        error={error}
        loading={isLoading}
        style={{ display: "flex", flex: 1 }}
      />
    );
  }

  const groupsOfModels = groupModels(models, localeCode);

  if (models.length) {
    return (
      <Stack spacing="md" mb="lg">
        <ModelExplanationBanner />
        <ModelGrid role="grid">
          {groupsOfModels.map(groupOfModels => {
            const collectionId = groupOfModels[0].collection.id;
            return (
              <ModelGroup
                expanded={
                  collectionViewPreferences?.[collectionId]?.expanded ?? true
                }
                showAll={!!collectionViewPreferences?.[collectionId]?.showAll}
                toggleExpanded={() =>
                  handleToggleCollectionExpand(collectionId)
                }
                toggleShowAll={() =>
                  handleToggleCollectionShowAll(collectionId)
                }
                models={groupOfModels}
                key={`modelgroup-${collectionId}`}
                localeCode={localeCode}
              />
            );
          })}
        </ModelGrid>
      </Stack>
    );
  }

  return (
    <CenteredEmptyState
      title={<Box mb=".5rem">{t`No models here yet`}</Box>}
      message={
        <Box maw="24rem">{t`Models help curate data to make it easier to find answers to questions all in one place.`}</Box>
      }
      illustrationElement={
        <Box mb=".5rem">
          <img src={NoResults} />
        </Box>
      }
    />
  );
};
