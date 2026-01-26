import { t } from "ttag";

import { useTranslateContent } from "metabase/i18n/hooks";
import { Stack, Text } from "metabase/ui";

import { getQuestionTitle } from "../QuestionTitle";
import { SdkInternalNavigationBackButton } from "../SdkInternalNavigation/SdkInternalNavigationBackButton";
import { useSdkQuestionContext } from "../SdkQuestion/context";

import type { SdkQuestionDefaultViewProps } from "./SdkQuestionDefaultView";

interface DefaultViewTitleTextProps
  extends Pick<SdkQuestionDefaultViewProps, "withResetButton" | "title"> {
  isQuestionChanged?: boolean;
  onReset?: () => void;
  originalName?: string | null;
}

const DefaultViewTitleText = ({ title: Title }: DefaultViewTitleTextProps) => {
  // const { canGoBack } = useSdkInternalNavigationOptional();
  return (
    <Stack gap="xs">
      <SdkInternalNavigationBackButton />
      {typeof Title === "function" ? <Title></Title> : Title}
    </Stack>
  );
};

export const DefaultViewTitle = ({
  title,
  withResetButton = false,
}: SdkQuestionDefaultViewProps) => {
  const { question, originalQuestion, onReset } = useSdkQuestionContext();
  const tc = useTranslateContent();

  const isQuestionChanged = originalQuestion
    ? question?.isQueryDirtyComparedTo(originalQuestion)
    : true;

  if (title === false) {
    return null;
  }

  if (title === undefined || title === true) {
    const originalName = tc(originalQuestion?.displayName());

    const titleText = tc(getQuestionTitle({ question }));

    return (
      <DefaultViewTitleText
        title={
          titleText && (
            <Text fw={700} c="text-primary" fz="xl">
              {titleText}
            </Text>
          )
        }
        withResetButton={withResetButton}
        isQuestionChanged={isQuestionChanged}
        onReset={onReset}
        originalName={originalName}
      />
    );
  }

  if (typeof title === "string") {
    const titleText = tc(title);

    return (
      <DefaultViewTitleText
        title={
          <Text fw={700} c="text-primary" fz="xl">
            {titleText}
          </Text>
        }
        withResetButton={withResetButton}
        isQuestionChanged={isQuestionChanged}
        onReset={onReset}
        originalName={t`the original exploration`}
      />
    );
  }

  if (typeof title === "function") {
    const CustomTitle = title;

    // TODO: pass in question={question} once we have the public-facing question type (metabase#50487)
    return <CustomTitle />;
  }

  return title;
};
