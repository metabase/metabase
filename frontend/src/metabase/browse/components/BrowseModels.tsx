import { t } from "ttag";

import type { SearchResult } from "metabase-types/api";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";

import type { useSearchListQuery } from "metabase/common/hooks";

import NoResults from "assets/img/no_results.svg";
import { Box } from "metabase/ui";

import { getLocale } from "metabase/setup/selectors";
import { groupModels } from "../utils";

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

  if (error || isLoading) {
    return (
      <LoadingAndErrorWrapper
        error={error}
        loading={isLoading}
        style={{ display: "flex", flex: 1 }}
      />
    );
  }

  const groupsOfModels = groupModels(models, localeCode);

  if (models.length) {
    return (
      <>
        <ModelExplanationBanner />
        <ModelGrid role="grid">
          {groupsOfModels.map(groupOfModels => (
            <ModelGroup
              models={groupOfModels}
              key={`modelgroup-${groupOfModels[0].collection.id}`}
              localeCode={localeCode}
            />
          ))}
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
