import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import QuestionResultLoader from "metabase/containers/QuestionResultLoader";
import CS from "metabase/css/core/index.css";
import { useDispatch, useStore } from "metabase/lib/redux";
import { updateQuestion } from "metabase/query_builder/actions";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import { FilterHeaderButton } from "metabase/query_builder/components/view/ViewHeader/components";
import { loadMetadataForTable } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import { Flex, Group, Stack, Title } from "metabase/ui";
import { getMode } from "metabase/visualizations/click-actions/lib/modes";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";

import S from "../view/BrowseTableData.module.css";

type CreateEditTableViewProps = {
  params: {
    dbId: string;
    tableId: string;
  };
};

export const CreateEditTableViewContainer = ({
  params: { dbId: dbIdParam, tableId: tableIdParam },
}: CreateEditTableViewProps) => {
  const tableId = parseInt(tableIdParam, 10);
  const databaseId = parseInt(dbIdParam, 10);

  const dispatch = useDispatch();
  const store = useStore();

  const [question, setQuestion] = useState<Question | null>(null);

  const [
    areFiltersExpanded,
    { open: onExpandFilters, close: onCollapseFilters },
  ] = useDisclosure(false);

  const mode = useMemo(() => {
    return question && getMode(question);
  }, [question]);

  useEffect(() => {
    const createAdHocQuestionForTable = async () => {
      await dispatch(loadMetadataForTable(tableId));

      const metadata = getMetadata(store.getState());
      const metadataProvider = Lib.metadataProvider(databaseId, metadata);
      const table = Lib.tableOrCardMetadata(metadataProvider, tableId);
      const query = Lib.queryFromTableOrCardMetadata(metadataProvider, table);
      const question = Question.create({ databaseId, metadata }).setQuery(
        query,
      );

      setQuestion(question);
    };

    createAdHocQuestionForTable();
  }, [tableId, dispatch, databaseId, store]);

  if (!question || !mode) {
    return null;
  }

  const card = question.card();

  return (
    <Stack className={S.container} gap={0} data-testid="table-view-create-root">
      <Flex
        p="lg"
        data-testid="table-data-view-header"
        bd="1px solid var(--mb-color-border)"
        justify="space-between"
      >
        <Group gap="sm">
          <Title>{t`New editable view`}</Title>
        </Group>

        <FilterHeaderButton
          className={cx(CS.hide, CS.smShow)}
          question={question}
          isExpanded={areFiltersExpanded}
          onExpand={onExpandFilters}
          onCollapse={onCollapseFilters}
        />
      </Flex>

      <QuestionResultLoader question={question}>
        {({ result, error }) => (
          <QueryVisualization
            className={cx(CS.flexFull, CS.fullWidth, CS.fullHeight)}
            question={question}
            rawSeries={[{ card, data: result && result.data }]}
            error={error}
            // isRunning={isQueryRunning}
            isObjectDetail={false}
            isResultDirty={false}
            isNativeEditorOpen={false}
            result={result}
            noHeader
            mode={mode}
            // navigateToNewCardInsideQB={undefined}
            // onNavigateBack={onNavigateBack}
            onUpdateQuestion={(question: Question) =>
              updateQuestion(question, { run: false })
            }
          />
        )}
      </QuestionResultLoader>
    </Stack>
  );
};
