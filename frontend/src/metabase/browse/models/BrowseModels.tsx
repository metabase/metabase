import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { skipToken, useListRecentsQuery } from "metabase/api";
import { DetailPanel } from "metabase/common/components/DetailPanel";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { ForwardRefLink } from "metabase/common/components/Link";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { useDocsUrl } from "metabase/common/hooks";
import {
  canUserCreateNativeQueries,
  canUserCreateQueries,
} from "metabase/current-user";
import { useNavSection } from "metabase/nav/containers/MainNavbar/use-nav-section";
import {
  PLUGIN_COLLECTIONS,
  PLUGIN_CONTENT_VERIFICATION,
} from "metabase/plugins";
import { useSelector } from "metabase/redux";
import {
  ActionIcon,
  Box,
  Button,
  Icon,
  Stack,
  Text,
  Title,
  Tooltip,
} from "metabase/ui";
import { isWithinIframe } from "metabase/utils/iframe";

import { BrowsePageLayout } from "../components/BrowsePageLayout";
import { partitionByAuthority } from "../utils";

import { ModelsVideo } from "./EmptyStates";
import { ModelExplanationBanner } from "./ModelExplanationBanner";
import { ModelsTable } from "./ModelsTable";
import { RecentModels } from "./RecentModels";
import { trackNewModelInitiated } from "./analytics";
import type { ModelFilterSettings, ModelResult } from "./types";
import { useFetchModels } from "./use-fetch-models";
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

  const { section, setSection } = useNavSection();
  const { official, unofficial } = useMemo(
    () => partitionByAuthority(models),
    [models],
  );
  const isOfficial = section === "official";
  const shown = isOfficial ? official : unofficial;

  const hasDataAccess = useSelector(canUserCreateQueries);
  const hasNativeWrite = useSelector(canUserCreateNativeQueries);
  const isEmbeddingIframe = isWithinIframe();

  const canCreateNewModel =
    !isEmbeddingIframe && hasDataAccess && hasNativeWrite;

  return (
    <BrowsePageLayout
      icon="model"
      title={t`Models`}
      titleId={titleId}
      testId="browse-models-header"
      meta={[
        t`Showing ${shown.length} of ${official.length + unofficial.length} models`,
        isOfficial ? t`Official only` : t`Unofficial only`,
      ]}
      description={t`Cleaned-up, combined tables ready to query. Official models live in the Library or in a collection marked official; the rest are in the Unofficial half of the sidebar.`}
      actions={
        <>
          <Button
            variant="subtle"
            size="compact-sm"
            onClick={() => setSection(isOfficial ? "unofficial" : "official")}
          >
            {isOfficial ? t`Show unofficial` : t`Show official`}
          </Button>
          {canCreateNewModel && (
            <Tooltip label={t`Create a new model`} position="bottom">
              <ActionIcon
                aria-label={t`Create a new model`}
                size={32}
                variant="viewHeader"
                component={ForwardRefLink}
                to="/model/new"
                onClick={() => trackNewModelInitiated()}
              >
                <Icon name="add" />
              </ActionIcon>
            </Tooltip>
          )}
          {hasVerifiedModels && (
            <ModelFilterControls
              modelFilters={modelFilters}
              setModelFilters={setModelFilters}
            />
          )}
        </>
      }
    >
      {isEmpty ? (
        <Stack gap="xl" align="center" data-testid="empty-state">
          {showMetabaseLinks && (
            <Box maw="45rem" w="100%">
              <ModelsVideo autoplay={0} />
            </Box>
          )}
          <Stack gap="xxs" maw="28rem">
            <Title
              order={2}
              ta="center"
            >{t`Create models to clean up and combine tables to make your data easier to explore`}</Title>
            <Text
              ta="center"
              lh="1.25rem"
            >{t`Models are somewhat like virtual tables: do all your joins and custom columns once, save it as a model, then query it like a table.`}</Text>
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
          <DetailPanel
            flush
            title={isOfficial ? t`Official models` : t`Unofficial models`}
          >
            <DelayedLoadingAndErrorWrapper
              error={error}
              loading={isLoading}
              style={{ flex: 1 }}
              loader={<ModelsTable skeleton />}
            >
              {shown.length === 0 ? (
                <Text p="lg" c="text-secondary">
                  {isOfficial
                    ? t`No official models yet. Publish a model to the Library, or mark its collection official.`
                    : t`Every model is official.`}
                </Text>
              ) : (
                <ModelsTable models={shown} />
              )}
            </DelayedLoadingAndErrorWrapper>
          </DetailPanel>
        </>
      )}
    </BrowsePageLayout>
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

  // Unjustified type cast. FIXME
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
        (model) => !filters.verified || model.moderated_status === "verified",
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
