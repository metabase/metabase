import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { StrategyForm } from "metabase/admin/performance/components/StrategyForm";
import { useCacheConfigs } from "metabase/admin/performance/hooks/useCacheConfigs";
import { useConfirmIfFormIsDirty } from "metabase/admin/performance/hooks/useConfirmIfFormIsDirty";
import { useSaveStrategy } from "metabase/admin/performance/hooks/useSaveStrategy";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { useLoadCardWithMetadata } from "metabase/data-studio/common/hooks/use-load-card-with-metadata";
import * as Urls from "metabase/lib/urls";
import { MetricPageShell } from "metabase/metrics/components/MetricPageShell";
import { metricUrls as defaultUrls } from "metabase/metrics/urls";
import type { MetricSettingsPageProps } from "metabase/plugins/oss/caching";
import { Card, Center } from "metabase/ui";
import { getItemName } from "metabase-enterprise/caching/components/utils";
import Question from "metabase-lib/v1/Question";
import type { CacheableModel } from "metabase-types/api";

const cachingModel: CacheableModel[] = ["question"];

export function MetricCachingPage({
  params,
  urls = defaultUrls,
  renderBreadcrumbs,
  showAppSwitcher,
  showDataStudioLink = true,
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
    isLoading: isLoadingConfigs,
    error: configsError,
  } = useCacheConfigs({
    model: cachingModel,
    id: cardId,
  });

  const { savedStrategy } = useMemo(() => {
    const targetConfig = _.findWhere(configs ?? [], { model_id: cardId });
    const savedStrategy = targetConfig?.strategy;
    return { savedStrategy };
  }, [configs, cardId]);

  const saveStrategy = useSaveStrategy(cardId ?? null, "metric");

  const { confirmationModal, setIsStrategyFormDirty } =
    useConfirmIfFormIsDirty();

  const isLoading = isLoadingCard || isLoadingConfigs;
  const error = cardError || configsError;

  if (isLoading || error != null || card == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer pos="relative" data-testid="metric-caching" gap="xl">
      <MetricPageShell
        card={card}
        urls={urls}
        renderBreadcrumbs={renderBreadcrumbs}
        showAppSwitcher={showAppSwitcher}
        showDataStudioLink={showDataStudioLink}
      />
      {question ? (
        <Card withBorder flex={1} p={0}>
          <StrategyForm
            targetId={question.id()}
            targetModel="metric"
            targetName={getItemName("question", question)}
            setIsDirty={setIsStrategyFormDirty}
            saveStrategy={saveStrategy}
            savedStrategy={savedStrategy}
            shouldAllowInvalidation
            shouldShowName={false}
            buttonLabels={{ save: t`Save`, discard: t`Cancel` }}
            classNames={{ formBox: CS.pt4 }}
          />
          {confirmationModal}
        </Card>
      ) : null}
    </PageContainer>
  );
}
