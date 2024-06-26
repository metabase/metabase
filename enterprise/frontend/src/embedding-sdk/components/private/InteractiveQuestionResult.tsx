import cx from "classnames";
import type { ReactElement, ReactNode } from "react";
import { t } from "ttag";

import {
  SdkError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import {
  QuestionBackButton,
  FilterBar,
  QuestionResetButton,
  Title,
} from "embedding-sdk/components/public/InteractiveQuestion";
import { useInteractiveQuestionContext } from "embedding-sdk/components/public/InteractiveQuestion/context";
import CS from "metabase/css/core/index.css";
import { Box, Flex, Group, Stack } from "metabase/ui";

import { QuestionVisualization } from "../public/InteractiveQuestion/components";

interface InteractiveQuestionResultProps {
  withTitle?: boolean;
  customTitle?: ReactNode;
  height?: string | number;
}

export const InteractiveQuestionResult = ({
  height,
}: InteractiveQuestionResultProps): ReactElement => {
  const {
    defaultHeight,
    isQueryRunning,
    isQuestionLoading,
    queryResults,
    question,
  } = useInteractiveQuestionContext();

  if (isQuestionLoading || isQueryRunning) {
    return <SdkLoader />;
  }

  if (!question || !queryResults) {
    return <SdkError message={t`Question not found`} />;
  }

  return (
    <Box
      className={cx(CS.flexFull, CS.fullWidth)}
      h={height ?? defaultHeight}
      bg="var(--mb-color-bg-question)"
    >
      <Stack h="100%">
        <Flex direction="row" gap="md" px="md" align="center">
          <QuestionBackButton />
          <Title />
          <QuestionResetButton />
        </Flex>

        <FilterBar />
        <Group h="100%" pos="relative" align="flex-start">
          <QuestionVisualization />
        </Group>
      </Stack>
    </Box>
  );
};
