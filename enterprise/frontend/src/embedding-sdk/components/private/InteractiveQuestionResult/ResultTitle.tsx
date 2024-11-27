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
  customTitle,
  withTitle = true,
  withResetButton = false,
}: InteractiveQuestionResultProps) => {
  const { question, originalQuestion, onReset } =
    useInteractiveQuestionContext();

  if (!withTitle) {
    return null;
  }

  if (isValidElement(customTitle)) {
    return customTitle;
  }

  const isQuestionChanged = originalQuestion
    ? question?.isQueryDirtyComparedTo(originalQuestion)
    : true;

  const originalName = originalQuestion?.displayName();

  const titleText =
    typeof customTitle === "string"
      ? customTitle
      : getQuestionTitle({ question });

  return (
    <ResultTitleText
      text={titleText}
      withResetButton={withResetButton}
      isQuestionChanged={isQuestionChanged}
      onReset={onReset}
      originalName={originalName}
    />
  );
};
