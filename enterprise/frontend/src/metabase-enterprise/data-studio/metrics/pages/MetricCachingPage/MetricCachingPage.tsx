import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { StrategyForm } from "metabase/admin/performance/components/StrategyForm";
import { useCacheConfigs } from "metabase/admin/performance/hooks/useCacheConfigs";
import { useConfirmIfFormIsDirty } from "metabase/admin/performance/hooks/useConfirmIfFormIsDirty";
import { useSaveStrategy } from "metabase/admin/performance/hooks/useSaveStrategy";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import * as Urls from "metabase/lib/urls";
import type { MetricSettingsPageProps } from "metabase/plugins/oss/caching";
import { Card, Center } from "metabase/ui";
import { getItemName } from "metabase-enterprise/caching/components/utils";
import { PageContainer } from "metabase-enterprise/data-studio/common/components/PageContainer";
import { useLoadCardWithMetadata } from "metabase-enterprise/data-studio/common/hooks/use-load-card-with-metadata";
import Question from "metabase-lib/v1/Question";
import type { CacheableModel } from "metabase-types/api";

import { MetricHeader } from "../../components/MetricHeader";

const model: CacheableModel[] = ["question"];

export function MetricCachingPage({ params }: MetricSettingsPageProps) {
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
    model,
    id: cardId,
  });

  const { savedStrategy } = useMemo(() => {
    const targetConfig = _.findWhere(configs ?? [], { model_id: cardId });
    const savedStrategy = targetConfig?.strategy;
    return { savedStrategy };
  }, [configs, cardId]);

  const saveStrategy = useSaveStrategy(cardId ?? null, "question");

  const { confirmationModal, setIsStrategyFormDirty } =
    useConfirmIfFormIsDirty();

  const isLoading = isLoadingCard || isLoadingConfigs;
  const error = cardError || configsError;

  return (
    <PageContainer pos="relative" data-testid="metric-caching" gap="xl">
      {card && <MetricHeader card={card} />}
      {isLoading || error != null ? (
        <Center h="100%">
          <LoadingAndErrorWrapper loading={isLoading} error={error} />
        </Center>
      ) : question ? (
        <Card withBorder flex={1} p={0}>
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
            classNames={{ formBox: CS.pt4 }}
          />
          {confirmationModal}
        </Card>
      ) : null}
    </PageContainer>
  );
}
