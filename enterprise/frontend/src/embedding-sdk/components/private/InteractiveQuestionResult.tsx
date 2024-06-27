import cx from "classnames";
import type { ReactElement } from "react";
import { useState } from "react";
import { t } from "ttag";

import {
  SdkError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import {
  BackButton,
  FilterBar,
  QuestionResetButton,
  Title,
  Filter,
  FilterButton,
  Summarize,
  SummarizeButton,
  QuestionVisualization,
} from "embedding-sdk/components/public/InteractiveQuestion";
import {
  useInteractiveQuestionContext,
  useInteractiveQuestionData,
} from "embedding-sdk/components/public/InteractiveQuestion/context";
import CS from "metabase/css/core/index.css";
import { Box, Button, Flex, Group, Stack } from "metabase/ui";

interface InteractiveQuestionResultProps {
  height?: string | number;
}

export const InteractiveQuestionResult = ({
  height,
}: InteractiveQuestionResultProps): ReactElement => {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSummarizeOpen, setIsSummarizeOpen] = useState(false);

  const { isQuestionLoading } = useInteractiveQuestionContext();

  const { defaultHeight, isQueryRunning, queryResults, question } =
    useInteractiveQuestionData();

  if (isQuestionLoading || isQueryRunning) {
    return <SdkLoader />;
  }

  if (!question || !queryResults) {
    return <SdkError message={t`Question not found`} />;
  }

  if (isFilterOpen) {
    return (
      <Stack>
        <Button onClick={() => setIsFilterOpen(!isFilterOpen)}>
          {t`Close`}
        </Button>
        <Filter />
      </Stack>
    );
  }

  if (isSummarizeOpen) {
    return <Summarize onClose={() => setIsSummarizeOpen(false)} />;
  }

  return (
    <Box
      className={cx(CS.flexFull, CS.fullWidth)}
      h={height ?? defaultHeight}
      bg="var(--mb-color-bg-question)"
    >
      <Stack h="100%">
        <Flex direction="row" gap="md" px="md" align="center">
          <BackButton />
          <Title />
          <QuestionResetButton />
          <FilterButton onClick={() => setIsFilterOpen(!isFilterOpen)} />
          <SummarizeButton
            isOpen={isSummarizeOpen}
            onClose={() => setIsSummarizeOpen(false)}
          />
        </Flex>

        <FilterBar />

        <Group h="100%" pos="relative" align="flex-start">
          <QuestionVisualization />
        </Group>
      </Stack>
    </Box>
  );
};
