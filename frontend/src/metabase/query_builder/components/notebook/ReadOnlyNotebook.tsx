import Notebook from "metabase/query_builder/components/notebook/Notebook";
import type Question from "metabase-lib/Question";

import { ReadOnlyNotebookContainer } from "./ReadOnlyNotebook.styled";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function ReadOnlyNotebook({ question }: { question: Question }) {
  return (
    <ReadOnlyNotebookContainer data-testid="read-only-notebook">
      <Notebook question={question} hasVisualizeButton={false} readOnly />
    </ReadOnlyNotebookContainer>
  );
}
