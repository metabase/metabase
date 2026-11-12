/* eslint-disable @typescript-eslint/no-unsafe-assignment -- FIXME: any-typed values */
import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useListRecentsQuery } from "metabase/api";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { ForwardRefLink } from "metabase/common/components/Link";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { useDocsUrl } from "metabase/common/hooks";
import {
  canUserCreateNativeQueries,
  canUserCreateQueries,
} from "metabase/current-user";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Group,
  Icon,
  Stack,
  Text,
  Title,
  Tooltip,
} from "metabase/ui";
import { isWithinIframe } from "metabase/utils/iframe";

import S from "../components/BrowseContainer.module.css";

import { ModelsVideo } from "./EmptyStates";
import { ModelExplanationBanner } from "./ModelExplanationBanner";
import { ModelsTable } from "./ModelsTable";
import { RecentModels } from "./RecentModels";
import { trackNewModelInitiated } from "./analytics";
import type { ModelResult } from "./types";
import { useFetchModels } from "./use-fetch-models";
import { getMaxRecentModelCount, isRecentModel } from "./utils";

export const BrowseModels = () => {
  const { isLoading, error, models, recentModels } = useModels();

  const { showMetabaseLinks, url } = useDocsUrl("data-modeling/models/models");

  const isEmpty = !isLoading && !error && models.length === 0;
  const titleId = useMemo(() => _.uniqueId("browse-models"), []);

  const hasDataAccess = useSelector(canUserCreateQueries);
  const hasNativeWrite = useSelector(canUserCreateNativeQueries);
  const isEmbeddingIframe = isWithinIframe();

  const canCreateNewModel =
    !isEmbeddingIframe && hasDataAccess && hasNativeWrite;

  return (
    <Flex
      className={S.browseContainer}
      flex={1}
      direction="column"
      wrap="nowrap"
      pt="lg"
      aria-labelledby={titleId}
    >
      <Flex
        className={S.browseHeader}
        direction="column"
        role="heading"
        data-testid="browse-models-header"
      >
        <Flex maw="64rem" mx="auto" w="100%">
          <Flex
            w="100%"
            h="2.25rem"
            direction="row"
            justify="space-between"
            align="center"
          >
            <Title order={1} c="text-primary" id={titleId}>
              <Group gap="sm">
                <Icon size={24} c="icon-brand" name="model" />
                {t`Models`}
              </Group>
            </Title>
            <Group gap="xxs">
              {canCreateNewModel && (
                <Tooltip label={t`Create a new model`} position="bottom">
                  <ActionIcon
                    variant="subtle"
                    aria-label={t`Create a new model`}
                    component={ForwardRefLink}
                    to="/model/new"
                    onClick={() => trackNewModelInitiated()}
                  >
                    <Icon name="add" />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
          </Flex>
        </Flex>
      </Flex>
      <Flex className={S.browseMain} direction="column" wrap="nowrap" flex={1}>
        <Flex maw="64rem" mx="auto" w="100%">
          <Stack mb="xl" gap="lg" w="100%">
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
                  <Button
                    component={ExternalLink}
                    href={url}
                    variant="subtle"
                  >{t`Read the docs`}</Button>
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
        </Flex>
      </Flex>
    </Flex>
  );
};

function useModels() {
  const modelsResult = useFetchModels({
    filter_items_in_personal_collection: "exclude",
    model_ancestors: false,
  });

  // Unjustified type cast. FIXME
  const models = modelsResult.data?.data as ModelResult[] | undefined;

  const recentsCap = getMaxRecentModelCount(models?.length ?? 0);

  const recentModelsResult = useListRecentsQuery(undefined, {
    refetchOnMountOrArgChange: true,
    skip: recentsCap === 0,
  });

  return {
    isLoading: modelsResult.isLoading || recentModelsResult.isLoading,
    error: modelsResult.error || recentModelsResult.error,
    models: PLUGIN_COLLECTIONS.filterOutItemsFromInstanceAnalytics(
      models ?? [],
    ),
    recentModels: (recentModelsResult.data ?? [])
      .filter(isRecentModel)
      .slice(0, recentsCap),
  };
}
