import { t } from "ttag";

import { Anchor, Stack, Text } from "metabase/ui";

import { useInteractiveQuestionContext } from "../InteractiveQuestion/context";
import { getQuestionTitle } from "../QuestionTitle";

import type { InteractiveQuestionResultProps } from "./InteractiveQuestionResult";

interface ResultTitleTextProps
  extends Pick<InteractiveQuestionResultProps, "withResetButton" | "title"> {
  isQuestionChanged?: boolean;
  onReset?: () => void;
  originalName?: string | null;
}

const ResultTitleText = ({
  title: Title,
  withResetButton = false,
  isQuestionChanged = false,
  onReset,
  originalName,
}: ResultTitleTextProps) => (
  <Stack spacing="xs">
    {originalName && withResetButton && isQuestionChanged && (
      <Text fw={600} size="sm">
        Return to
        <Anchor size="sm" ml="xs" color="brand" onClick={onReset}>
          {originalName}
        </Anchor>
      </Text>
    )}
    {typeof Title === "function" ? <Title></Title> : Title}
  </Stack>
);

export const ResultTitle = ({
  title,
  withResetButton = false,
}: InteractiveQuestionResultProps) => {
  const { question, originalQuestion, onReset } =
    useInteractiveQuestionContext();

  const isQuestionChanged = originalQuestion
    ? question?.isQueryDirtyComparedTo(originalQuestion)
    : true;

  if (title === false) {
    return null;
  }

  if (title === undefined || title === true) {
    const originalName = originalQuestion?.displayName();

    const titleText = getQuestionTitle({ question });

    return (
      <ResultTitleText
        title={
          <Text fw={700} c="var(--mb-color-text-primary)" fz="xl">
            {titleText}
          </Text>
        }
        withResetButton={withResetButton}
        isQuestionChanged={isQuestionChanged}
        onReset={onReset}
        originalName={originalName}
      />
    );
  }

  if (typeof title === "string") {
    return (
      <ResultTitleText
        title={
          <Text fw={700} c="var(--mb-color-text-primary)" fz="xl">
            {title}
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
