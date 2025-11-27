import { match } from "ts-pattern";
import { t } from "ttag";
import { useEffect } from "react";

import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import { Sidesheet, SidesheetCard } from "metabase/common/components/Sidesheet";
// import { useStackedModals } from "metabase/common/hooks";
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

  // const { getModalProps, currentModal, close, open } = useStackedModals({
  //   modals: ["default", "caching"],
  //   defaultOpened: "default",
  //   withOverlay: true,
  // });

  const modals = useModalsStack(["default", "caching"]);

  useEffect(() => {
    modals.open("default");
  }, []);

  // const defaultModalProps = getModalProps("default");
  // const cachingModalProps = getModalProps("caching");

  const currentModal = modals.state.caching ? "caching" : "default";

  return (
    <>
      <Sidesheet
        title={getTitle(question)}
        isOpen={modals.state.default}
        onClose={handleClose}
        withOverlay={!modals.state.caching}
        overlayProps={undefined}
        closeOnEscape={!modals.state.caching}
        data-testid="question-settings-sidebar"
      >
        <div>This is using useModalsStack from Mantine</div>
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
                setPage={() => modals.open("caching")}
                key={currentModal}
              />
            </Stack>
          </SidesheetCard>
        )}
      </Sidesheet>

      <PLUGIN_CACHING.SidebarCacheForm
        item={question}
        model="question"
        isOpen={modals.state.caching}
        onClose={handleClose}
        withOverlay={true}
        overlayProps={undefined}
        onBack={() => modals.close("caching")}
        pt="md"
      />
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
