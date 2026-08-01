import cx from "classnames";
import { useMemo, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { useUpdateCardMutation } from "metabase/api";
import { NotFound } from "metabase/common/components/ErrorPages";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import {
  PaneHeader,
  PaneHeaderActions,
  PanelHeaderTitle,
} from "metabase/common/data-studio/components/PaneHeader";
import { useCollectionPath } from "metabase/common/data-studio/hooks/use-collection-path/useCollectionPath";
import { getResultMetadata } from "metabase/common/data-studio/utils/get-result-metadata";
import { modelIconMap } from "metabase/common/utils/icon";
import CS from "metabase/css/core/index.css";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { useLoadCardWithMetadata } from "metabase/metrics/common/use-load-card-with-metadata";
import {
  QueryEditor,
  getInitialUiState,
} from "metabase/querying/editor/components/QueryEditor";
import { useSelector } from "metabase/redux";
import { useParams } from "metabase/router";
import { getMetadata } from "metabase/selectors/metadata";
import { Breadcrumbs, Card, Icon } from "metabase/ui";
import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import {
  type Card as CardApiType,
  type CardType,
  isCardDisplayType,
} from "metabase-types/api";

import { useContentStudioEntityScope } from "../scope";

type ContentStudioQuestionParams = {
  cardId: string;
};

/** Questions, models and metrics share this page; the card's type only shapes its chrome and save. */
export function ContentStudioQuestionPage() {
  const { cardId: slug } = useParams<ContentStudioQuestionParams>();
  const cardId = Urls.extractEntityId(slug);
  const { card, metadata, isLoading, error } = useLoadCardWithMetadata(cardId);

  useContentStudioEntityScope(card ? (card.worktree_id ?? null) : undefined);

  if (cardId == null) {
    return <NotFound />;
  }

  if (isLoading || error != null || card == null || metadata == null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <ContentStudioQuestionView key={card.id} card={card} />;
}

function ContentStudioQuestionView({ card }: { card: CardApiType }) {
  const metadata = useSelector(getMetadata);
  const [datasetQuery, setDatasetQuery] = useState(card.dataset_query);
  const [uiState, setUiState] = useState(getInitialUiState);
  const [updateCard, { isLoading: isSaving }] = useUpdateCardMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const question = useMemo(
    () => new Question(card, metadata).setDatasetQuery(datasetQuery),
    [card, metadata, datasetQuery],
  );

  const resultMetadata = useMemo(
    () =>
      getResultMetadata(
        datasetQuery,
        uiState.lastRunQuery,
        uiState.lastRunResult,
      ),
    [datasetQuery, uiState.lastRunQuery, uiState.lastRunResult],
  );

  const isDirty = useMemo(
    () => !Lib.areLegacyQueriesEqual(datasetQuery, card.dataset_query),
    [datasetQuery, card.dataset_query],
  );

  const readOnly = !card.can_write;

  const { display, settings } = useMemo(
    () => getDisplay(card, question.query()),
    [card, question],
  );

  const uiOptions = useMemo(
    () => ({
      cardType: card.type,
      cardDisplay: display,
      cardVizSettings: settings,
      readOnly,
    }),
    [card.type, display, settings, readOnly],
  );

  const handleSave = async () => {
    const questionWithMetadata = question.setResultsMetadata(
      resultMetadata ? { columns: resultMetadata } : null,
    );
    const { error } = await updateCard({
      id: card.id,
      dataset_query: questionWithMetadata.datasetQuery(),
      result_metadata: resultMetadata,
      ...(card.type === "metric"
        ? { display, visualization_settings: settings }
        : {}),
    });

    if (error) {
      sendErrorToast(getSaveErrorMessage(card.type));
    } else {
      sendSuccessToast(getSaveSuccessMessage(card.type));
    }
  };

  const handleCancel = () => {
    setDatasetQuery(card.dataset_query);
  };

  return (
    <>
      <PageContainer
        px={0}
        pos="relative"
        data-testid="content-studio-question"
      >
        <PaneHeader
          title={<PanelHeaderTitle>{card.name}</PanelHeaderTitle>}
          icon={modelIconMap[card.type]}
          showAppSwitcher={false}
          breadcrumbs={<ContentStudioCardBreadcrumbs card={card} />}
          actions={
            <PaneHeaderActions
              isValid={Lib.canSave(question.query(), card.type)}
              isDirty={isDirty}
              isSaving={isSaving}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          }
        />
        <Card withBorder shadow="none" flex={1} p={0}>
          <QueryEditor
            query={question.query()}
            uiState={uiState}
            uiOptions={uiOptions}
            onChangeQuery={(query) => setDatasetQuery(Lib.toJsQuery(query))}
            onChangeUiState={setUiState}
          />
        </Card>
      </PageContainer>
      <LeaveRouteConfirmModal isEnabled={isDirty && !isSaving} />
    </>
  );
}

function ContentStudioCardBreadcrumbs({ card }: { card: CardApiType }) {
  const { path, isLoadingPath } = useCollectionPath({
    collectionId: card.collection_id,
  });

  return (
    <Breadcrumbs
      separator={<Icon size={12} name="chevronright" />}
      fz="sm"
      c="text-secondary"
      className={cx({ [CS.hidden]: isLoadingPath })}
    >
      {path?.map((collection) => (
        <Link
          key={collection.id}
          to={Urls.contentStudioCollection({
            id: collection.id,
            name: collection.name,
          })}
        >
          {collection.name}
        </Link>
      ))}
    </Breadcrumbs>
  );
}

/**
 * A metric has no user-chosen visualization, so its query dictates one. Questions
 * and models keep whatever the user picked in the query builder.
 */
function getDisplay(card: CardApiType, query: Lib.Query) {
  if (card.type === "metric") {
    return Lib.defaultDisplay(query);
  }

  return {
    display: isCardDisplayType(card.display) ? card.display : undefined,
    settings: card.visualization_settings,
  };
}

function getSaveSuccessMessage(cardType: CardType) {
  return match(cardType)
    .with("question", () => t`Question updated`)
    .with("model", () => t`Model updated`)
    .with("metric", () => t`Metric updated`)
    .exhaustive();
}

function getSaveErrorMessage(cardType: CardType) {
  return match(cardType)
    .with("question", () => t`Failed to update question`)
    .with("model", () => t`Failed to update model`)
    .with("metric", () => t`Failed to update metric`)
    .exhaustive();
}
