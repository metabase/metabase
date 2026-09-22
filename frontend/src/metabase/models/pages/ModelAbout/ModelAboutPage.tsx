import { useMemo } from "react";
import { t } from "ttag";

import {
  skipToken,
  useGetCardQuery,
  useGetCardQueryMetadataQuery,
} from "metabase/api";
import { NotFound } from "metabase/common/components/ErrorPages";
import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import {
  PaneHeader,
  PanelHeaderTitle,
} from "metabase/common/data-studio/components/PaneHeader";
import { useHeaderCollection } from "metabase/common/hooks/use-header-collection";
import { useQuestionFromCard } from "metabase/metadata-store";
import { useParams } from "metabase/router";
import { Button } from "metabase/ui";
import * as Urls from "metabase/urls";

import { ModelAbout } from "./ModelAbout";

type ModelAboutPageParams = {
  slug: string;
};

export function ModelAboutPage() {
  const params = useParams<ModelAboutPageParams>();
  const cardId = Urls.extractEntityId(params.slug);

  const {
    data: card,
    isLoading: isLoadingCard,
    error: cardError,
  } = useGetCardQuery(cardId != null ? { id: cardId } : skipToken);
  const { isLoading: isLoadingMetadata, error: metadataError } =
    useGetCardQueryMetadataQuery(cardId ?? skipToken);

  const buildQuestion = useQuestionFromCard();
  const question = useMemo(
    () => (card != null ? buildQuestion(card) : undefined),
    [card, buildQuestion],
  );

  useHeaderCollection(card?.collection_id);

  const isLoading = isLoadingCard || isLoadingMetadata;
  const error = cardError ?? metadataError;

  if (isLoading || error != null || card == null || question == null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (card.type !== "model" || question.isArchived()) {
    return <NotFound />;
  }

  return (
    <PageContainer data-testid="model-about-page" gap="xxl">
      <PaneHeader
        data-testid="model-header"
        icon="model"
        // The collection breadcrumbs and the account switcher both live in the
        // app-wide page header.
        showAppSwitcher={false}
        title={<PanelHeaderTitle>{card.name}</PanelHeaderTitle>}
        actions={
          <Button
            component={Link}
            to={Urls.modelDetail(card, "actions")}
            variant="subtle"
            size="compact-sm"
          >
            {t`Actions`}
          </Button>
        }
      />
      <ModelAbout card={card} question={question} />
    </PageContainer>
  );
}
