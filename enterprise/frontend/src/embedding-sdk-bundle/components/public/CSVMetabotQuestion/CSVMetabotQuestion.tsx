import { useElementSize } from "@mantine/hooks";
import { useId, useMemo } from "react";
import { P, match } from "ts-pattern";

import { FlexibleSizeComponent } from "embedding-sdk-bundle/components/private/FlexibleSizeComponent";
import { withPublicComponentWrapper } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { SdkAdHocQuestion } from "embedding-sdk-bundle/components/private/SdkAdHocQuestion";
import { SdkQuestionDefaultView } from "embedding-sdk-bundle/components/private/SdkQuestionDefaultView";
import { EnsureSingleInstance } from "embedding-sdk-shared/components/EnsureSingleInstance/EnsureSingleInstance";
import { useLocale } from "metabase/common/hooks/use-locale";
import { Box, Center, Group, Icon, Stack, Text } from "metabase/ui";
import { useMetabotReactions } from "metabase-enterprise/metabot/hooks/use-metabot-reactions";

import { MetabotChatHistory } from "../MetabotQuestion/MetabotChatHistory";
import { MetabotChatInput } from "../MetabotQuestion/MetabotChatInput";
import { MetabotChatSuggestions } from "../MetabotQuestion/MetabotChatSuggestions";
import S from "../MetabotQuestion/MetabotQuestion.module.css";
import { metabotQuestionSchema } from "../MetabotQuestion/MetabotQuestion.schema";
import { MetabotQuestionEmptyState } from "../MetabotQuestion/MetabotQuestionEmptyState";
import { QuestionDetails } from "../MetabotQuestion/QuestionDetails";
import { QuestionTitle } from "../MetabotQuestion/QuestionTitle";
import { SidebarHeader } from "../MetabotQuestion/SidebarHeader";
import type { MetabotQuestionProps } from "../MetabotQuestion/types";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { SdkQuestion } from "../SdkQuestion";
import { ResultToolbar } from "embedding-sdk-bundle/components/private/SdkQuestion/components/ResultToolbar/ResultToolbar";
import { ToolbarButton } from "embedding-sdk-bundle/components/private/SdkQuestion/components/util/ToolbarButton";
import { useDownloadData } from "metabase/query_builder/components/QuestionDownloadWidget/use-download-data";
import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import { StaticQuestion } from "../StaticQuestion";

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
  modelId,
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
      return <StaticQuestion questionId={modelId} />;
    }

    return (
      <SdkAdHocQuestion
        questionPath={navigateToPath}
        title={false}
        isSaveEnabled={false}
        withDownloads
      >
        <Stack gap="sm" w="100%" h="100%" pos="relative">
          <Box
            pos="absolute"
            top={0}
            right={20}
            bg="white"
            style={{ zIndex: 100000 }}
          >
            <DownloadButton />
          </Box>

          <SdkQuestion.QuestionVisualization height="100%" />
        </Stack>
      </SdkAdHocQuestion>
    );
  }

  useRegisterMetabotContextProvider(async () => {
    console.log({
      modelId,
    });
    return {
      user_is_viewing: [
        {
          type: "model",
          id: modelId,
        },
      ],
    };
  }, []);

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

export const CSVMetabotQuestion = Object.assign(
  withPublicComponentWrapper(MetabotQuestionWrapped),
  { schema: metabotQuestionSchema },
);

const DownloadButton = () => {
  const { question, queryResults } = useSdkQuestionContext();
  const [result] = queryResults || [];

  const [, handleDownload] = useDownloadData({
    question,
    result,
  });

  return (
    <ToolbarButton
      isHighlighted={false}
      variant="default"
      px="sm"
      label={
        <Group gap="0.5rem">
          <Text>Download Chart</Text>
          <Icon c="inherit" size={16} name="download" />
        </Group>
      }
      data-testid="question-download-widget-button"
      onClick={() => handleDownload({ type: "png" })}
    />
  );
};
