import { useElementSize } from "@mantine/hooks";
import { useId, useMemo } from "react";
import { P, match } from "ts-pattern";

import { withPublicComponentWrapper } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { ResizeWrapper } from "embedding-sdk-bundle/components/private/ResizeWrapper";
import { SdkAdHocQuestion } from "embedding-sdk-bundle/components/private/SdkAdHocQuestion";
import { SdkQuestionDefaultView } from "embedding-sdk-bundle/components/private/SdkQuestionDefaultView";
import { METABOT_SDK_EE_PLUGIN } from "embedding-sdk-bundle/components/public/MetabotQuestion/MetabotQuestion";
import { EnsureSingleInstance } from "embedding-sdk-shared/components/EnsureSingleInstance/EnsureSingleInstance";
import { useLocale } from "metabase/common/hooks/use-locale";
import { Stack } from "metabase/ui";
import { useMetabotReactions } from "metabase-enterprise/metabot/hooks/use-metabot-reactions";

import { MetabotChatHistory } from "./MetabotChatHistory";
import { MetabotChatInput } from "./MetabotChatInput";
import { MetabotChatSuggestions } from "./MetabotChatSuggestions";
import S from "./MetabotQuestion.module.css";
import { metabotQuestionSchema } from "./MetabotQuestion.schema";
import { MetabotQuestionEmptyState } from "./MetabotQuestionEmptyState";
import { QuestionDetails } from "./QuestionDetails";
import { QuestionTitle } from "./QuestionTitle";
import { SidebarHeader } from "./SidebarHeader";

import type { MetabotQuestionProps } from ".";

/**
 * If the Metabot component's container size is smaller
 * than this, use the stacked layout.
 **/
const MAX_MOBILE_CONTAINER_WIDTH = 700;

const MetabotQuestionInner = ({
  height,
  width,
  className,
  style,
  layout = "auto",
  isSaveEnabled = false,
  targetCollection,
}: MetabotQuestionProps) => {
  const { isLocaleLoading } = useLocale();
  const { navigateToPath } = useMetabotReactions();
  const { ref: containerRef, width: containerWidth } = useElementSize();

  const hasQuestion = !!navigateToPath;

  const derivedLayout = useMemo(() => {
    return match(layout)
      .with(P.union("stacked", "sidebar"), (layout) => layout)
      .otherwise((layout) => {
        if (layout !== "auto") {
          console.warn(
            `Invalid layout for MetabotQuestion: ${layout}. Valid values are "stacked", "sidebar", or "auto"`,
          );
        }

        return containerWidth <= MAX_MOBILE_CONTAINER_WIDTH
          ? "stacked"
          : "sidebar";
      });
  }, [layout, containerWidth]);

  function renderQuestion() {
    if (!hasQuestion || isLocaleLoading) {
      return <MetabotQuestionEmptyState />;
    }

    return (
      <SdkAdHocQuestion
        questionPath={navigateToPath}
        title={false}
        isSaveEnabled={isSaveEnabled}
        targetCollection={targetCollection}
      >
        <SdkQuestionDefaultView
          height="100%"
          withChartTypeSelector
          title={
            <Stack gap="sm" mb="1rem">
              <QuestionTitle />
              <QuestionDetails />
            </Stack>
          }
        />
      </SdkAdHocQuestion>
    );
  }

  // avoids initial flickering
  if (!derivedLayout || containerWidth == null) {
    return null;
  }

  return (
    <ResizeWrapper h={height} w={width} className={className} style={style}>
      <div
        ref={containerRef}
        className={S.container}
        data-layout={derivedLayout}
        data-testid="metabot-question-container"
      >
        <div className={S.question}>{renderQuestion()}</div>

        <div className={S.chat}>
          <Stack w="100%" h="100%" pos="relative" gap={0}>
            <SidebarHeader />
            <MetabotChatHistory />

            <Stack gap={0}>
              <MetabotChatSuggestions />
              <MetabotChatInput />
            </Stack>
          </Stack>
        </div>
      </div>
    </ResizeWrapper>
  );
};

const MetabotQuestionWrapped = (props: MetabotQuestionProps) => {
  const ensureSingleInstanceId = useId();

  return (
    <EnsureSingleInstance
      groupId="metabot-question"
      instanceId={ensureSingleInstanceId}
      multipleRegisteredInstancesWarningMessage={
        "Multiple instances of MetabotQuestion detected. Ensure only one instance of MetabotQuestion is rendered at a time."
      }
    >
      <MetabotQuestionInner {...props} />
    </EnsureSingleInstance>
  );
};

// side effect that activates the plugin
METABOT_SDK_EE_PLUGIN.MetabotQuestion = Object.assign(
  withPublicComponentWrapper(MetabotQuestionWrapped, {
    supportsGuestEmbed: false,
  }),
  { schema: metabotQuestionSchema },
);
