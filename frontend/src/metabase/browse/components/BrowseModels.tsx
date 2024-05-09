import { useMemo } from "react";
import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import { useSearchQuery } from "metabase/api";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { color } from "metabase/lib/colors";
import { PLUGIN_CONTENT_VERIFICATION } from "metabase/plugins";
import { Box, Flex, Group, Icon, Stack, Title } from "metabase/ui";

import { filterModels, type ActualModelFilters } from "../utils";

import {
  BrowseContainer,
  BrowseHeader,
  BrowseMain,
  BrowseSection,
  CenteredEmptyState,
} from "./BrowseContainer.styled";
import { ModelExplanationBanner } from "./ModelExplanationBanner";
import { ModelsTable } from "./ModelsTable";

const { availableModelFilters, useModelFilterSettings } =
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
  const { data, error, isLoading } = useSearchQuery({
    models: ["dataset"],
    filter_items_in_personal_collection: "exclude",
    model_ancestors: true,
  });

  const models = useMemo(() => {
    const unfilteredModels = data?.data ?? [];
    const filteredModels = filterModels(
      unfilteredModels || [],
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
        style={{ display: "flex", flex: 1 }}
      />
    );
  }

  if (models.length) {
    return (
      <Stack spacing="md" mb="lg">
        <ModelExplanationBanner />
        <ModelsTable items={models} />
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
