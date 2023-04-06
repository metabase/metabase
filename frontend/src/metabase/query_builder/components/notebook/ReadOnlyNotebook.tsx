import React from "react";

import Notebook from "metabase/query_builder/components/notebook/Notebook";
import type Question from "metabase-lib/Question";

import { ReadOnlyNotebookContainer } from "./ReadOnlyNotebook.styled";

export default function ReadOnlyNotebook({ question }: { question: Question }) {
  return (
    <ReadOnlyNotebookContainer data-testid="read-only-notebook">
      <Notebook question={question} hasVisualizeButton={false} readOnly />
    </ReadOnlyNotebookContainer>
  );
}
