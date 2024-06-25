import cx from "classnames";
import { t } from "ttag";

import {
  SdkError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import { QuestionBackButton } from "embedding-sdk/components/public/InteractiveQuestion/components/BackButton";
import { Filter } from "embedding-sdk/components/public/InteractiveQuestion/components/Filter";
import { FilterBar } from "embedding-sdk/components/public/InteractiveQuestion/components/FilterBar";
import { FilterButton } from "embedding-sdk/components/public/InteractiveQuestion/components/FilterButton";
import { QuestionResetButton } from "embedding-sdk/components/public/InteractiveQuestion/components/ResetButton";
import { Title } from "embedding-sdk/components/public/InteractiveQuestion/components/Title";
import { useInteractiveQuestionContext } from "embedding-sdk/components/public/InteractiveQuestion/context";
import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/lib/redux";
import { Box, Flex, Group, Stack } from "metabase/ui";

import { QuestionVisualization } from "../public/InteractiveQuestion/components";

interface InteractiveQuestionResultProps {
  withTitle?: boolean;
  customTitle?: React.ReactNode;
  height?: string | number;
}

export const InteractiveQuestionResult = ({
  height,
}: InteractiveQuestionResultProps): React.ReactElement => {
  useDispatch();

  const {
    defaultHeight,
    isQueryRunning,
    isQuestionLoading,
    queryResults,
    question,
    isFilterOpen,
  } = useInteractiveQuestionContext();

  if (isQuestionLoading || isQueryRunning) {
    return <SdkLoader />;
  }

  if (!question || !queryResults) {
    return <SdkError message={t`Question not found`} />;
  }

  if (isFilterOpen) {
    return <Filter />;
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
          <FilterButton />
        </Flex>

        <FilterBar />

        <Group h="100%" pos="relative" align="flex-start">
          <QuestionVisualization />
        </Group>
      </Stack>
    </Box>
  );
};
