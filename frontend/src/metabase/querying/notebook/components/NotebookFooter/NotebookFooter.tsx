import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import {
  getFirstQueryResult,
  getRawSeries,
  getUiControls,
} from "metabase/query_builder/selectors";
import { Box, Flex, Switch, Text } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import S from "./NotebookFooter.module.css";

export type NotebookFooterProps = {
  question: Question;
  isDirty: boolean;
  isRunnable: boolean;
  isResultDirty: boolean;
  runQuestionQuery: () => Promise<void>;
  liveUpdate: boolean;
  onLiveUpdateChange: (liveUpdate: boolean) => void;
};

export function NotebookFooter({
  question,
  runQuestionQuery,
  isRunnable,
  isResultDirty,
  liveUpdate,
  onLiveUpdateChange,
}: NotebookFooterProps) {
  const result = useSelector(getFirstQueryResult);
  const rawSeries = useSelector(getRawSeries);
  const uiControls = useSelector(getUiControls);

  return (
    <Box h="300px" pos="relative" mt="lg">
      <Flex gap="lg" px="xl" py="sm" align="center" className={S.header}>
        <Text weight="bold">{t`Preview`}</Text>
        <Switch
          checked={liveUpdate}
          onChange={evt => onLiveUpdateChange(evt.target.checked)}
          size="xs"
          label={t`Live results`}
        />
      </Flex>
      <QueryVisualization
        question={question}
        result={result}
        rawSeries={rawSeries}
        isRunnable={isRunnable}
        isRunning={uiControls.isRunning}
        isResultDirty={isResultDirty}
        runQuestionQuery={runQuestionQuery}
        cancelQuery={() => null}
      />
    </Box>
  );
}
