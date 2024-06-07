import { useMemo } from "react";
import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import { useFetchModels } from "metabase/common/hooks/use-fetch-models";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { color } from "metabase/lib/colors";
import {
  PLUGIN_COLLECTIONS,
  PLUGIN_CONTENT_VERIFICATION,
} from "metabase/plugins";
import { Box, Flex, Group, Icon, Stack, Title } from "metabase/ui";
import type { ModelResult } from "metabase-types/api";

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

  const result = useFetchModels({ model_ancestors: true });

  const { allModels, doVerifiedModelsExist } = useMemo(() => {
    const allModels = (result.data?.data as ModelResult[] | undefined) ?? [];
    const doVerifiedModelsExist = allModels.some(
      model => model.moderated_status === "verified",
    );
    return { allModels, doVerifiedModelsExist };
  }, [result]);

  const models = useMemo(
    () => PLUGIN_COLLECTIONS.filterOutItemsFromInstanceAnalytics(allModels),
    [allModels],
  );

  const { filteredModels } = useMemo(() => {
    // If no models are verified, don't filter them
    const filteredModels = doVerifiedModelsExist
      ? filterModels(models, actualModelFilters, availableModelFilters)
      : models;
    return { filteredModels };
  }, [actualModelFilters, doVerifiedModelsExist, models]);

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
            {doVerifiedModelsExist && (
              <ModelFilterControls
                actualModelFilters={actualModelFilters}
                setActualModelFilters={setActualModelFilters}
              />
            )}
          </Flex>
        </BrowseSection>
      </BrowseHeader>
      <BrowseMain>
        <BrowseSection>
          <BrowseModelsBody result={result} models={filteredModels} />
        </BrowseSection>
      </BrowseMain>
    </BrowseContainer>
  );
};

export const BrowseModelsBody = ({
  models,
  result,
}: {
  models: ModelResult[];
  result: { error?: any; isLoading: boolean };
}) => {
  if (result.error || result.isLoading) {
    return (
      <LoadingAndErrorWrapper
        error={result.error}
        loading={result.isLoading}
        style={{ flex: 1 }}
      />
    );
  }

  if (models.length) {
    return (
      <Stack mb="lg" spacing="md">
        <ModelExplanationBanner />
        <ModelsTable models={models} />
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
