import { useMemo, useState } from "react";
import { t } from "ttag";

import { NotebookProvider } from "metabase/querying/notebook/components/Notebook/context";
import { NotebookCell } from "metabase/querying/notebook/components/NotebookCell";
import { NotebookDataPicker } from "metabase/querying/notebook/components/NotebookDataPicker";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";

import S from "./NewQueryNotebookPrompt.module.css";

type Props = {
  onSelect: (url: string) => void;
};

export function NewQueryNotebookPrompt({ onSelect }: Props) {
  const metadata = useSelector(getMetadata);
  const [isOpened, setIsOpened] = useState(true);

  const question = useMemo(() => Question.create({ metadata }), [metadata]);
  const query = question.query();
  const stageIndex = -1;

  const handleChange = (
    table: Lib.TableMetadata | Lib.CardMetadata,
    metadataProvider: Lib.MetadataProvider,
  ) => {
    const nextQuery = Lib.queryFromTableOrCardMetadata(
      metadataProvider,
      table,
    );
    const nextQuestion = question.setQuery(nextQuery);
    const url = Urls.question(nextQuestion).replace(
      /^\/question/,
      "/question/new/notebook",
    );
    onSelect(url);
  };

  return (
    <div className={S.root} data-testid="new-query-notebook-prompt">
      <Text className={S.label} fw={700} fz="md">
        {t`Data`}
      </Text>
      <NotebookProvider>
        <NotebookCell color="core-brand" className={S.dataBox}>
          <NotebookDataPicker
            query={query}
            stageIndex={stageIndex}
            table={undefined}
            title={t`Pick your starting data`}
            canChangeDatabase
            hasMetrics
            isOpened={isOpened}
            setIsOpened={setIsOpened}
            isDisabled={false}
            onChange={handleChange}
            columnPicker={null}
          />
        </NotebookCell>
      </NotebookProvider>
    </div>
  );
}
