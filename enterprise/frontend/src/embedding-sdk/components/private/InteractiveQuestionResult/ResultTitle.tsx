import { type ReactNode, isValidElement } from "react";

import { Anchor, Stack, Text } from "metabase/ui";

import { useInteractiveQuestionContext } from "../InteractiveQuestion/context";
import { getQuestionTitle } from "../QuestionTitle";

import type { InteractiveQuestionResultProps } from "./InteractiveQuestionResult";

interface ResultTitleTextProps
  extends Pick<InteractiveQuestionResultProps, "withResetButton"> {
  text: string | ReactNode;
  isQuestionChanged?: boolean;
  onReset?: () => void;
  originalName?: string | null;
}

const ResultTitleText = ({
  text,
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
    <Text fw={700} c="var(--mb-color-text-primary)" fz="xl">
      {text}
    </Text>
  </Stack>
);

export const ResultTitle = ({
  title,
  withResetButton = false,
}: InteractiveQuestionResultProps) => {
  const { question, originalQuestion, onReset } =
    useInteractiveQuestionContext();

  if (title === false) {
    return null;
  }

  if (title === undefined || title === true) {
    const isQuestionChanged = originalQuestion
      ? question?.isQueryDirtyComparedTo(originalQuestion)
      : true;

    const originalName = originalQuestion?.displayName();

    const titleText = getQuestionTitle({ question });

    return (
      <ResultTitleText
        text={titleText}
        withResetButton={withResetButton}
        isQuestionChanged={isQuestionChanged}
        onReset={onReset}
        originalName={originalName}
      />
    );
  }

  if (typeof title === "string") {
    return (
      <Text fw={700} c="var(--mb-color-text-primary)" fz="xl">
        {title}
      </Text>
    );
  }

  if (typeof title === "function") {
    const CustomTitle = title;

    // TODO: pass in question={question} once we have the public-facing question type (metabase#50487)
    return <CustomTitle />;
  }

  return title;
};
