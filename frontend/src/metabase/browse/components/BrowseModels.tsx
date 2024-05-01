import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import NoResults from "assets/img/no_results.svg";
import { useSearchQuery } from "metabase/api";
import type { SortingOptions } from "metabase/components/ItemsTable/BaseItemsTable";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Search from "metabase/entities/search";
import { color } from "metabase/lib/colors";
import { useDispatch } from "metabase/lib/redux";
import { PLUGIN_CONTENT_VERIFICATION } from "metabase/plugins";
import { Box, Flex, Group, Icon, Stack, Title } from "metabase/ui";
import type { SearchRequest } from "metabase-types/api";

import { filterModels, type ActualModelFilters } from "../utils";

import {
  BrowseContainer,
  BrowseHeader,
  BrowseMain,
  BrowseSection,
  CenteredEmptyState,
} from "./BrowseApp.styled";
import { ModelExplanationBanner } from "./ModelExplanationBanner";
import { ModelsTable } from "./ModelsTable";

const { availableModelFilters, useModelFilterSettings } =
  PLUGIN_CONTENT_VERIFICATION;

export const BrowseModels = () => {
  const initialModelFilters = useModelFilterSettings();

  const [actualModelFilters, setActualModelFilters] =
    useState<ActualModelFilters>(initialModelFilters);

  useEffect(() => {
    setActualModelFilters(initialModelFilters);
  }, [initialModelFilters, setActualModelFilters]);

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
              setActualModelFilters={setActualModelFilters}
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
  const dispatch = useDispatch();
  const [sortingOptions, setSortingOptions] = useState<SortingOptions>({
    sort_column: "name",
    sort_direction: "asc",
  });

  const query: SearchRequest = {
    models: ["dataset"], // 'model' in the sense of 'type of thing'
    model_ancestors: true,
    filter_items_in_personal_collection: "exclude",
    ...sortingOptions,
  };

  const { data, error, isLoading } = useSearchQuery(query);
  const unfilteredModels = data?.data;

  const models = useMemo(
    () =>
      filterModels(
        unfilteredModels || [],
        actualModelFilters,
        availableModelFilters,
      ),
    [unfilteredModels, actualModelFilters],
  );

  const wrappedModels = models.map(model => Search.wrapEntity(model, dispatch));

  if (error || isLoading) {
    return (
      <LoadingAndErrorWrapper
        error={error}
        loading={isLoading}
        style={{ display: "flex", flex: 1 }}
      />
    );
  }

  if (models.length) {
    return (
      <Stack spacing="md" mb="lg">
        <ModelExplanationBanner />
        <ModelsTable
          items={wrappedModels}
          sortingOptions={sortingOptions}
          onSortingOptionsChange={setSortingOptions}
        />
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
