import { useMount } from "react-use";
import { match } from "ts-pattern";
import { t } from "ttag";

import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import { Sidesheet, SidesheetCard } from "metabase/common/components/Sidesheet";
import { useDispatch } from "metabase/lib/redux";
import { PLUGIN_CACHING, PLUGIN_MODEL_PERSISTENCE } from "metabase/plugins";
import { onCloseQuestionSettings } from "metabase/query_builder/actions";
import { Stack, useModalsStack } from "metabase/ui";
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

  const { open, state, close } = useModalsStack(["default", "caching"]);

  const currentModal: keyof typeof state = state.caching
    ? "caching"
    : "default";

  useMount(() => {
    // the modal is not rendered until it is "open"
    // but we want to set it open after it mounts to get
    // pretty animations
    open("default");
  });

  return (
    <>
      <Sidesheet
        title={getTitle(question)}
        isOpen={state.default}
        onClose={handleClose}
        closeOnEscape={currentModal === "default"}
        data-testid="question-settings-sidebar"
      >
        {question.type() === "model" && (
          <SidesheetCard title={t`Caching`}>
            <ModelCacheManagementSection model={question} />
          </SidesheetCard>
        )}

        {hasCacheSection && (
          <SidesheetCard title={t`Caching`}>
            <Stack gap="0.5rem">
              <PLUGIN_CACHING.SidebarCacheSection
                model="question"
                item={question}
                setPage={() => open("caching")}
                key={currentModal}
              />
            </Stack>
          </SidesheetCard>
        )}
      </Sidesheet>
      {currentModal === "caching" && (
        <PLUGIN_CACHING.SidebarCacheForm
          item={question}
          model="question"
          isOpen={state.caching}
          onClose={handleClose}
          overlayProps={{ bg: "transparent" }}
          onBack={() => close("caching")}
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
