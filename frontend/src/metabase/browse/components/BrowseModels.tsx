import { useMemo } from "react";
import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import { useListRecentItemsQuery } from "metabase/api";
import { useFetchModels } from "metabase/common/hooks/use-fetch-models";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { color } from "metabase/lib/colors";
import { PLUGIN_CONTENT_VERIFICATION } from "metabase/plugins";
import { Box, Flex, Group, Icon, Stack, Title } from "metabase/ui";

import type { ModelResult } from "../types";
import { isRecentModel } from "../types";
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
import { RecentModels } from "./RecentModels";
import { getMaxRecentModelCount } from "./utils";

const { availableModelFilters, useModelFilterSettings, ModelFilterControls } =
  PLUGIN_CONTENT_VERIFICATION;

export const BrowseModels = () => {
  /** Mapping of filter names to true if the filter is active or false if it is inactive */
  const [actualModelFilters, setActualModelFilters] = useModelFilterSettings();

  const modelsResult = useFetchModels({ model_ancestors: true });

  const { allModels, doVerifiedModelsExist } = useMemo(() => {
    const allModels =
      (modelsResult.data?.data as ModelResult[] | undefined) ?? [];
    const doVerifiedModelsExist = allModels.some(
      model => model.moderated_status === "verified",
    );
    return { allModels, doVerifiedModelsExist };
  }, [modelsResult]);

  const { filteredModels } = useMemo(() => {
    // If no models are verified, don't filter them
    const filteredModels = doVerifiedModelsExist
      ? filterModels(allModels, actualModelFilters, availableModelFilters)
      : allModels;
    return { filteredModels };
  }, [allModels, actualModelFilters, doVerifiedModelsExist]);

  const recentModelsResult = useListRecentItemsQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });

  const filteredRecentModels = useMemo(
    () =>
      filterModels(
        recentModelsResult.data?.filter(isRecentModel),
        actualModelFilters,
        availableModelFilters,
      ),
    [recentModelsResult.data, actualModelFilters],
  );

  const recentModels = useMemo(() => {
    const cap = getMaxRecentModelCount(allModels.length);
    return filteredRecentModels.slice(0, cap);
  }, [filteredRecentModels, allModels.length]);

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
          <LoadingAndErrorWrapper
            error={modelsResult.error || recentModelsResult.error}
            loading={modelsResult.isLoading || recentModelsResult.isLoading}
            style={{ flex: 1 }}
          >
            {filteredModels.length ? (
              <Stack mb="lg" spacing="md">
                <ModelExplanationBanner />
                <RecentModels models={recentModels} />
                <ModelsTable models={filteredModels} />
              </Stack>
            ) : (
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
            )}
          </LoadingAndErrorWrapper>
        </BrowseSection>
      </BrowseMain>
    </BrowseContainer>
  );
};
