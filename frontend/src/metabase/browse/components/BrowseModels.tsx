import { useMemo } from "react";
import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import { useSearchQuery } from "metabase/api";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { color } from "metabase/lib/colors";
import { PLUGIN_CONTENT_VERIFICATION } from "metabase/plugins";
import { Box, Flex, Group, Icon, Stack, Title } from "metabase/ui";
import type { ModelResult, SearchRequest } from "metabase-types/api";

import type { ActualModelFilters } from "../utils";
import { filterModels } from "../utils";

import {
  BrowseContainer,
  BrowseHeader,
  BrowseMain,
  BrowseSection,
  CenteredEmptyState,
} from "./BrowseContainer.styled";
import { ModelExplanationBanner } from "./ModelExplanationBanner";
import { ModelsTable } from "./ModelsTable";

const { availableModelFilters, useModelFilterSettings, ModelFilterControls } =
  PLUGIN_CONTENT_VERIFICATION;

export const BrowseModels = () => {
  const [actualModelFilters, setActualModelFilters] = useModelFilterSettings();

  return (
    <BrowseContainer>
      <BrowseHeader>
        <BrowseSection>
          <Flex
            w="100%"
            h="2.25rem"
            direction="row"
            justify="space-between"
            align="center"
          >
            <Title order={1} color="text-dark">
              <Group spacing="sm">
                <Icon size={24} color={color("brand")} name="model" />
                {t`Models`}
              </Group>
            </Title>
            <ModelFilterControls
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
  /** Mapping of filter names to true if the filter is active
   * or false if it is inactive */
  actualModelFilters: ActualModelFilters;
}) => {
  const query: SearchRequest = {
    models: ["dataset"], // 'model' in the sense of 'type of thing'
    model_ancestors: true,
    filter_items_in_personal_collection: "exclude",
  };
  const { data, error, isLoading } = useSearchQuery(query);

  const filteredModels = useMemo(() => {
    const unfilteredModels = (data?.data as ModelResult[]) ?? [];
    const filteredModels = filterModels(
      unfilteredModels,
      actualModelFilters,
      availableModelFilters,
    );
    return filteredModels;
  }, [data, actualModelFilters]);

  if (error || isLoading) {
    return (
      <LoadingAndErrorWrapper
        error={error}
        loading={isLoading}
        style={{ flex: 1 }}
      />
    );
  }

  if (filteredModels.length) {
    return (
      <Stack mb="lg" spacing="md">
        <ModelExplanationBanner />
        <ModelsTable models={filteredModels} />
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
