import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import NoResults from "assets/img/no_results.svg";
import { skipToken, useListRecentsQuery } from "metabase/api";
import { useFetchModels } from "metabase/common/hooks/use-fetch-models";
import { DelayedLoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import {
  PLUGIN_COLLECTIONS,
  PLUGIN_CONTENT_VERIFICATION,
} from "metabase/plugins";
import { Box, Flex, Group, Icon, Stack, Title } from "metabase/ui";

import {
  BrowseContainer,
  BrowseHeader,
  BrowseMain,
  BrowseSection,
  CenteredEmptyState,
} from "../components/BrowseContainer.styled";

import { ModelExplanationBanner } from "./ModelExplanationBanner";
import { ModelsTable } from "./ModelsTable";
import { RecentModels } from "./RecentModels";
import type { ModelFilterSettings, ModelResult } from "./types";
import { getMaxRecentModelCount, isRecentModel } from "./utils";

const {
  contentVerificationEnabled,
  ModelFilterControls,
  getDefaultModelFilters,
} = PLUGIN_CONTENT_VERIFICATION;

export const BrowseModels = () => {
  const [modelFilters, setModelFilters] = useModelFilterSettings();
  const { isLoading, error, models, recentModels, hasVerifiedModels } =
    useFilteredModels(modelFilters);

  const isEmpty = !isLoading && !error && models.length === 0;
  const titleId = useMemo(() => _.uniqueId("browse-models"), []);

  return (
    <BrowseContainer aria-labelledby={titleId}>
      <BrowseHeader role="heading" data-testid="browse-models-header">
        <BrowseSection>
          <Flex
            w="100%"
            h="2.25rem"
            direction="row"
            justify="space-between"
            align="center"
          >
            <Title order={1} color="text-dark" id={titleId}>
              <Group spacing="sm">
                <Icon
                  size={24}
                  color="var(--mb-color-icon-primary)"
                  name="model"
                />
                {t`Models`}
              </Group>
            </Title>
            {hasVerifiedModels && (
              <ModelFilterControls
                modelFilters={modelFilters}
                setModelFilters={setModelFilters}
              />
            )}
          </Flex>
        </BrowseSection>
      </BrowseHeader>
      <BrowseMain>
        <BrowseSection>
          <Stack mb="lg" spacing="md" w="100%">
            {isEmpty ? (
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
            ) : (
              <>
                <ModelExplanationBanner />
                <DelayedLoadingAndErrorWrapper
                  error={error}
                  loading={isLoading}
                  style={{ flex: 1 }}
                  loader={<RecentModels skeleton />}
                >
                  <RecentModels models={recentModels} />
                </DelayedLoadingAndErrorWrapper>
                <DelayedLoadingAndErrorWrapper
                  error={error}
                  loading={isLoading}
                  style={{ flex: 1 }}
                  loader={<ModelsTable skeleton />}
                >
                  <ModelsTable models={models} />
                </DelayedLoadingAndErrorWrapper>
              </>
            )}
          </Stack>
        </BrowseSection>
      </BrowseMain>
    </BrowseContainer>
  );
};

function useModelFilterSettings() {
  const defaultModelFilters = useSelector(getDefaultModelFilters);
  return useState(defaultModelFilters);
}

function useHasVerifiedModels() {
  const result = useFetchModels(
    contentVerificationEnabled
      ? {
          filter_items_in_personal_collection: "exclude",
          model_ancestors: false,
          limit: 0,
          verified: true,
        }
      : skipToken,
  );

  if (!contentVerificationEnabled) {
    return {
      isLoading: false,
      error: null,
      result: false,
    };
  }

  const total = result.data?.total ?? 0;

  return {
    isLoading: result.isLoading,
    error: result.error,
    result: total > 0,
  };
}

function useFilteredModels(modelFilters: ModelFilterSettings) {
  const hasVerifiedModels = useHasVerifiedModels();

  const filters = cleanModelFilters(modelFilters, hasVerifiedModels.result);

  const modelsResult = useFetchModels(
    hasVerifiedModels.isLoading || hasVerifiedModels.error
      ? skipToken
      : {
          filter_items_in_personal_collection: "exclude",
          model_ancestors: false,
          ...filters,
        },
  );

  const models = modelsResult.data?.data as ModelResult[] | undefined;

  const recentsCap = getMaxRecentModelCount(models?.length ?? 0);

  const recentModelsResult = useListRecentsQuery(undefined, {
    refetchOnMountOrArgChange: true,
    skip: recentsCap === 0,
  });

  const isLoading =
    hasVerifiedModels.isLoading ||
    modelsResult.isLoading ||
    recentModelsResult.isLoading;

  const error =
    hasVerifiedModels.error || modelsResult.error || recentModelsResult.error;

  return {
    isLoading,
    error,
    hasVerifiedModels: hasVerifiedModels.result,
    models: PLUGIN_COLLECTIONS.filterOutItemsFromInstanceAnalytics(
      models ?? [],
    ),

    recentModels: (recentModelsResult.data ?? [])
      .filter(isRecentModel)
      .filter(
        model => !filters.verified || model.moderated_status === "verified",
      )
      .slice(0, recentsCap),
  };
}

function cleanModelFilters(
  modelFilters: ModelFilterSettings,
  hasVerifiedModels: boolean,
) {
  const filters = { ...modelFilters };
  if (!hasVerifiedModels || !filters.verified) {
    // we cannot pass false or undefined to the backend
    // delete the key instead
    delete filters.verified;
  }
  return filters;
}
