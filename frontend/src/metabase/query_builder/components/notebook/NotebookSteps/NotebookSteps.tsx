import React, { useCallback, useMemo, useState } from "react";

import type Question from "metabase-lib/Question";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";

import { getQuestionSteps } from "../lib/steps";
import { NotebookStep as INotebookStep } from "../lib/steps.types";
import NotebookStep from "../NotebookStep";
import { Container } from "./NotebookSteps.styled";

interface NotebookStepsProps {
  className?: string;
  question: Question;
  sourceQuestion?: Question;
  reportTimezone?: string;
  updateQuestion: (question: Question) => Promise<void>;
}

type OpenSteps = { [key: string]: boolean };

function getInitialOpenSteps(question: Question): OpenSteps {
  const isNew = !question.table();
  return isNew
    ? {
        "0:filter": true,
        "0:summarize": true,
      }
    : {};
}

function NotebookSteps({
  className,
  question,
  sourceQuestion,
  reportTimezone,
  updateQuestion,
}: NotebookStepsProps) {
  const [openSteps, setOpenSteps] = useState<OpenSteps>(
    getInitialOpenSteps(question),
  );
  const [lastOpenedStep, setLastOpenedStep] = useState<string | null>(null);

  const steps = useMemo(() => {
    if (!question) {
      return [];
    }
    return getQuestionSteps(question, openSteps);
  }, [question, openSteps]);

  const handleStepOpen = useCallback((id: string) => {
    setOpenSteps(openSteps => ({ ...openSteps, [id]: true }));
    setLastOpenedStep(id);
  }, []);

  const handleStepClose = useCallback((id: string) => {
    setOpenSteps(openSteps => ({ ...openSteps, [id]: false }));
    setLastOpenedStep(lastOpenedStep =>
      lastOpenedStep === id ? null : lastOpenedStep,
    );
  }, []);

  const handleQueryChange = useCallback(
    async (step: INotebookStep, query: StructuredQuery) => {
      const datasetQuery = query.datasetQuery();
      const updatedQuery = step.update(datasetQuery);
      await updateQuestion(updatedQuery.question());

      // mark the step as "closed" since we can assume
      // it's been added or removed by the updateQuery
      handleStepClose(step.id);
    },
    [updateQuestion, handleStepClose],
  );

  if (!question) {
    return null;
  }

  return (
    <Container className={className}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const isLastOpened = lastOpenedStep === step.id;
        const onChange = (query: StructuredQuery) =>
          handleQueryChange(step, query);

        return (
          <NotebookStep
            key={step.id}
            step={step}
            sourceQuestion={sourceQuestion}
            isLastStep={isLast}
            isLastOpened={isLastOpened}
            reportTimezone={reportTimezone}
            updateQuery={onChange}
            openStep={handleStepOpen}
          />
        );
      })}
    </Container>
  );
}

export default NotebookSteps;
