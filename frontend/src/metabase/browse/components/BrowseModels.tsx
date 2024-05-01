import { useState } from "react";
import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import type { useSearchListQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { getLocale } from "metabase/setup/selectors";
import { Box } from "metabase/ui";
import type { SearchResult, CollectionId } from "metabase-types/api";

import { BROWSE_MODELS_LOCALSTORAGE_KEY } from "../constants";
import { getCollectionViewPreferences, groupModels } from "../utils";

import { CenteredEmptyState } from "./BrowseApp.styled";
import { ModelGrid } from "./BrowseModels.styled";
import { ModelExplanationBanner } from "./ModelExplanationBanner";
import { ModelGroup } from "./ModelGroup";

export const BrowseModels = ({
  modelsResult,
}: {
  modelsResult: ReturnType<typeof useSearchListQuery<SearchResult>>;
}) => {
  const { data: models = [], error, isLoading } = modelsResult;
  const locale = useSelector(getLocale);
  const localeCode: string | undefined = locale?.code;
  const [collectionViewPreferences, setCollectionViewPreferences] = useState(
    getCollectionViewPreferences,
  );

  if (error || isLoading) {
    return (
      <LoadingAndErrorWrapper
        error={error}
        loading={isLoading}
        style={{ display: "flex", flex: 1 }}
      />
    );
  }

  const handleToggleCollectionExpand = (collectionId: CollectionId) => {
    const newPreferences = {
      ...collectionViewPreferences,
      [collectionId]: {
        expanded: !(
          collectionViewPreferences?.[collectionId]?.expanded ?? true
        ),
        showAll: !!collectionViewPreferences?.[collectionId]?.showAll,
      },
    };
    setCollectionViewPreferences(newPreferences);
    localStorage.setItem(
      BROWSE_MODELS_LOCALSTORAGE_KEY,
      JSON.stringify(newPreferences),
    );
  };

  const handleToggleCollectionShowAll = (collectionId: CollectionId) => {
    const newPreferences = {
      ...collectionViewPreferences,
      [collectionId]: {
        expanded: collectionViewPreferences?.[collectionId]?.expanded ?? true,
        showAll: !collectionViewPreferences?.[collectionId]?.showAll,
      },
    };
    setCollectionViewPreferences(newPreferences);
    localStorage.setItem(
      BROWSE_MODELS_LOCALSTORAGE_KEY,
      JSON.stringify(newPreferences),
    );
  };

  const groupsOfModels = groupModels(models, localeCode);

  if (models.length) {
    return (
      <>
        <ModelExplanationBanner />
        <ModelGrid role="grid">
          {groupsOfModels.map(groupOfModels => {
            const collectionId = groupOfModels[0].collection.id;
            return (
              <ModelGroup
                expanded={
                  collectionViewPreferences?.[collectionId]?.expanded ?? true
                }
                showAll={!!collectionViewPreferences?.[collectionId]?.showAll}
                toggleExpanded={() =>
                  handleToggleCollectionExpand(collectionId)
                }
                toggleShowAll={() =>
                  handleToggleCollectionShowAll(collectionId)
                }
                models={groupOfModels}
                key={`modelgroup-${collectionId}`}
                localeCode={localeCode}
              />
            );
          })}
        </ModelGrid>
      </>
    );
  }

  return (
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
  );
};
