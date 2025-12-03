import { useMemo } from "react";
import type { InjectedRouter, Route } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import { StrategyForm } from "metabase/admin/performance/components/StrategyForm";
import { useCacheConfigs } from "metabase/admin/performance/hooks/useCacheConfigs";
import { useConfirmIfFormIsDirty } from "metabase/admin/performance/hooks/useConfirmIfFormIsDirty";
import { useSaveStrategy } from "metabase/admin/performance/hooks/useSaveStrategy";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import * as Urls from "metabase/lib/urls";
import { Box, Center, Flex } from "metabase/ui";
import { getItemName } from "metabase-enterprise/caching/components/utils";
import { useLoadCardWithMetadata } from "metabase-enterprise/data-studio/common/hooks/use-load-card-with-metadata";
import Question from "metabase-lib/v1/Question";
import type { CacheableModel } from "metabase-types/api";

import { MetricHeader } from "../../components/MetricHeader";

type MetricSettingsPageParams = {
  cardId: string;
};

type MetricSettingsPageProps = {
  params: MetricSettingsPageParams;
  router?: InjectedRouter;
  route?: Route;
};

const configurableModels: CacheableModel[] = ["question"];

export function MetricCachingPage({
  params,
  router,
  route,
}: MetricSettingsPageProps) {
  const cardId = Urls.extractEntityId(params.cardId);
  const {
    card,
    isLoading: isLoadingCard,
    error: cardError,
  } = useLoadCardWithMetadata(cardId);
  const question = useMemo(() => card && new Question(card), [card]);

  const {
    configs,
    setConfigs,
    loading,
    error: configsError,
  } = useCacheConfigs({
    configurableModels,
    id: cardId,
  });

  const { savedStrategy, filteredConfigs } = useMemo(() => {
    const targetConfig = _.findWhere(configs, { model_id: cardId });
    const savedStrategy = targetConfig?.strategy;
    const filteredConfigs = _.compact([targetConfig]);
    return { savedStrategy, filteredConfigs };
  }, [configs, cardId]);

  const saveStrategy = useSaveStrategy(
    cardId ?? null,
    filteredConfigs,
    setConfigs,
    "question",
  );

  const { confirmationModal, setIsStrategyFormDirty } = useConfirmIfFormIsDirty(
    router,
    route,
  );

  const isLoading = isLoadingCard || loading;
  const error = cardError || configsError;

  return (
    <Flex direction="column" h="100%">
      {card && <MetricHeader card={card} />}
      {isLoading || error != null ? (
        <Center h="100%">
          <LoadingAndErrorWrapper loading={isLoading} error={error} />
        </Center>
      ) : question ? (
        <Box className={CS.overflowAuto} h="100%">
          <Box
            m="lg"
            pt="lg"
            bd="1px solid var(--mb-color-border)"
            bdrs="md"
            bg="background"
            className={CS.overflowHidden}
          >
            <StrategyForm
              targetId={question.id()}
              targetModel="question"
              targetName={getItemName("question", question)}
              setIsDirty={setIsStrategyFormDirty}
              saveStrategy={saveStrategy}
              savedStrategy={savedStrategy}
              shouldAllowInvalidation
              shouldShowName={false}
              buttonLabels={{ save: t`Save`, discard: t`Cancel` }}
            />
            {confirmationModal}
          </Box>
        </Box>
      ) : null}
    </Flex>
  );
}
