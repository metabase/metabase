import { useMemo, useState } from "react";
import { useMount } from "react-use";
import { match } from "ts-pattern";
import { t } from "ttag";

import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import { Sidesheet, SidesheetCard } from "metabase/common/components/Sidesheet";
import { useDispatch } from "metabase/lib/redux";
import { PLUGIN_CACHING, PLUGIN_MODEL_PERSISTENCE } from "metabase/plugins";
import { onCloseQuestionSettings } from "metabase/query_builder/actions";
import { Stack } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { ModelCacheManagementSection } from "../ModelCacheManagementSection";

const getTitle = (question: Question) => {
  return match(question.type())
    .with("model", () => t`Model settings`)
    .with("metric", () => t`Metric settings`)
    .otherwise(() => t`Question settings`);
};

export const QuestionSettingsSidebar = ({
  question,
}: {
  question: Question;
}) => {
  const hasCacheSection =
    PLUGIN_CACHING.hasQuestionCacheSection(question) &&
    PLUGIN_CACHING.isGranularCachingEnabled();

  const dispatch = useDispatch();
  const handleClose = () => dispatch(onCloseQuestionSettings());

  const [page, setPage] = useState<"default" | "caching">("default");
  const [isOpen, setIsOpen] = useState(false);

  useMount(() => {
    // this component is not rendered until it is "open"
    // but we want to set isOpen after it mounts to get
    // pretty animations
    setIsOpen(true);
  });

  const title = useMemo(() => getTitle(question), [question]);

  return (
    <>
      <Sidesheet
        title={title}
        onClose={handleClose}
        isOpen={isOpen}
        data-testid="question-settings-sidebar"
      >
        {question.type() === "model" && (
          <SidesheetCard title={t`Caching`}>
            <ModelCacheManagementSection model={question} />
          </SidesheetCard>
        )}

        {hasCacheSection && (
          <SidesheetCard title={t`Caching`}>
            <Stack spacing="0.5rem">
              <PLUGIN_CACHING.SidebarCacheSection
                model="question"
                item={question}
                setPage={setPage}
                key={page}
              />
            </Stack>
          </SidesheetCard>
        )}
      </Sidesheet>
      {page === "caching" && (
        <PLUGIN_CACHING.SidebarCacheForm
          item={question}
          model="question"
          onBack={() => setPage("default")}
          onClose={handleClose}
          pt="md"
        />
      )}
    </>
  );
};

export const shouldShowQuestionSettingsSidebar = (question: Question) => {
  const isIAQuestion = isInstanceAnalyticsCollection(question.collection());

  if (isIAQuestion) {
    return false;
  }

  const isCacheableQuestion =
    PLUGIN_CACHING.isGranularCachingEnabled() &&
    PLUGIN_CACHING.hasQuestionCacheSection(question);

  const isCacheableModel =
    question.type() === "model" &&
    PLUGIN_MODEL_PERSISTENCE.isModelLevelPersistenceEnabled() &&
    question.canWrite() &&
    !question.isArchived();
  // if the db has caching disabled, we still want to show the sidebar to surface that
  // information to the user

  return isCacheableQuestion || isCacheableModel;
};
