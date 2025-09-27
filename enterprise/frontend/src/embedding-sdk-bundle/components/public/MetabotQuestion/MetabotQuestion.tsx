import cx from "classnames";
import { useId } from "react";

import { FlexibleSizeComponent } from "embedding-sdk-bundle/components/private/FlexibleSizeComponent";
import { withPublicComponentWrapper } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { SdkAdHocQuestion } from "embedding-sdk-bundle/components/private/SdkAdHocQuestion";
import { SdkQuestionDefaultView } from "embedding-sdk-bundle/components/private/SdkQuestionDefaultView";
import { EnsureSingleInstance } from "embedding-sdk-shared/components/EnsureSingleInstance/EnsureSingleInstance";
import useIsSmallScreen from "metabase/common/hooks/use-is-small-screen";
import { useLocale } from "metabase/common/hooks/use-locale";
import { Stack } from "metabase/ui";
import { useMetabotReactions } from "metabase-enterprise/metabot/hooks/use-metabot-reactions";

import S from "./MetabotQuestion.module.css";
import { metabotQuestionSchema } from "./MetabotQuestion.schema";
import { MetabotQuestionEmptyState } from "./MetabotQuestionEmptyState";
import { MetabotSidebar } from "./MetabotSidebar";
import { QuestionDetails } from "./QuestionDetails";
import { QuestionTitle } from "./QuestionTitle";
import type { MetabotQuestionProps } from "./types";

const MetabotQuestionInner = ({
  height,
  width,
  className,
  style,
  layout = "auto",
}: MetabotQuestionProps) => {
  const { isLocaleLoading } = useLocale();
  const { navigateToPath } = useMetabotReactions();
  const isSmallScreen = useIsSmallScreen();

  const hasQuestion = !!navigateToPath;

  // Determine derived layout based on auto mode
  const derivedLayout =
    layout === "auto" ? (isSmallScreen ? "stacked" : "sidebar") : layout;

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
        className={cx(S.container, {
          [S.sidebarLayout]: derivedLayout === "sidebar",
          [S.stackedLayout]: derivedLayout === "stacked",
        })}
      >
        <div className={S.content}>{renderQuestion()}</div>

        <div className={S.chat}>
          <MetabotSidebar />
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
