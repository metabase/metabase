import { useElementSize } from "@mantine/hooks";
import { useId, useMemo } from "react";
import { P, match } from "ts-pattern";

import { FlexibleSizeComponent } from "embedding-sdk-bundle/components/private/FlexibleSizeComponent";
import { withPublicComponentWrapper } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { SdkAdHocQuestion } from "embedding-sdk-bundle/components/private/SdkAdHocQuestion";
import { SdkQuestionDefaultView } from "embedding-sdk-bundle/components/private/SdkQuestionDefaultView";
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
import type { MetabotQuestionProps } from "./types";

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
        isSaveEnabled={false}
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

  return (
    <FlexibleSizeComponent
      height={height}
      width={width}
      className={className}
      style={style}
    >
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
    </FlexibleSizeComponent>
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

export const MetabotQuestion = Object.assign(
  withPublicComponentWrapper(MetabotQuestionWrapped),
  { schema: metabotQuestionSchema },
);
