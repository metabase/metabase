import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { skipToken, useListRecentsQuery } from "metabase/api";
import { useDocsUrl } from "metabase/common/hooks";
import { useFetchModels } from "metabase/common/hooks/use-fetch-models";
import { DelayedLoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import ExternalLink from "metabase/core/components/ExternalLink";
import { useSelector } from "metabase/lib/redux";
import {
  PLUGIN_COLLECTIONS,
  PLUGIN_CONTENT_VERIFICATION,
} from "metabase/plugins";
import {
  Box,
  Button,
  Flex,
  Group,
  Icon,
  Stack,
  Text,
  Title,
} from "metabase/ui";

import {
  BrowseContainer,
  BrowseHeader,
  BrowseMain,
  BrowseSection,
} from "../components/BrowseContainer.styled";

import { ModelsVideo } from "./EmptyStates";
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

  const { showMetabaseLinks, url } = useDocsUrl("data-modeling/models");

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
            <Title order={1} c="text-dark" id={titleId}>
              <Group gap="sm">
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
          <Stack mb="lg" gap="md" w="100%">
            {isEmpty ? (
              <Stack gap="lg" align="center" data-testid="empty-state">
                <Box maw="45rem" w="100%">
                  <ModelsVideo autoplay={0} />
                </Box>
                <Stack gap="xs" maw="28rem">
                  <Title
                    order={2}
                    ta="center"
                  >{t`Create models to clean up and combine tables to make your data easier to explore`}</Title>
                  <Text ta="center">{t`Models are somewhat like virtual tables: do all your joins and custom columns once, save it as a model, then query it like a table.`}</Text>
                </Stack>
                {showMetabaseLinks && (
                  <Button variant="subtle" p={0}>
                    <ExternalLink href={url}>{t`Read the docs`}</ExternalLink>
                  </Button>
                )}
              </Stack>
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
