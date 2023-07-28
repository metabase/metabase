import { useCallback, useMemo, useState } from "react";

import * as Lib from "metabase-lib";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";

import type { Query } from "metabase-lib/types";
import type Question from "metabase-lib/Question";

import type {
  NotebookStep as INotebookStep,
  OpenSteps,
  UpdateQueryOpts,
} from "../types";
import { getQuestionSteps } from "../lib/steps";
import NotebookStep from "../NotebookStep";
import { Container } from "./NotebookSteps.styled";

interface NotebookStepsProps {
  className?: string;
  question: Question;
  sourceQuestion?: Question;
  reportTimezone: string;
  updateQuestion: (question: Question) => Promise<void>;
  readOnly?: boolean;
}

function getInitialOpenSteps(question: Question, readOnly: boolean): OpenSteps {
  const isNew = !readOnly && !question.table();

  if (isNew) {
    return {
      "0:filter": true,
      "0:summarize": true,
    };
  }

  // We need to keep join steps open at all time for MLv1-MLv2 compat
  // This should be reworked once all notebook clauses are using MLv2
  // Learn more: ...
  // TODO add PR link

  const steps = getQuestionSteps(question, {});
  const joinSteps = steps.filter(step => step.type === "join");
  const openStepsEntries = joinSteps.map(step => [step.id, true]);

  return Object.fromEntries(openStepsEntries);
}

function NotebookSteps({
  className,
  question,
  sourceQuestion,
  reportTimezone,
  updateQuestion,
  readOnly = false,
}: NotebookStepsProps) {
  const [openSteps, setOpenSteps] = useState<OpenSteps>(
    getInitialOpenSteps(question, readOnly),
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
    async (
      step: INotebookStep,
      query: StructuredQuery | Query,
      { closeStep = true }: UpdateQueryOpts = {},
    ) => {
      // Performs a query update with either metabase-lib v1 or v2
      // The StructuredQuery block is temporary and will be removed
      // once all the notebook steps are using metabase-lib v2
      if (query instanceof StructuredQuery) {
        const datasetQuery = query.datasetQuery();
        const updatedQuery = step.update(datasetQuery);
        await updateQuestion(updatedQuery.question());
      } else {
        const updatedLegacyQuery = Lib.toLegacyQuery(query);
        const updatedQuestion = question.setDatasetQuery(updatedLegacyQuery);
        const updatedQuery = updatedQuestion.query() as StructuredQuery;
        const cleanQuestion = updatedQuery.cleanNesting().question();
        await updateQuestion(cleanQuestion);
      }

      if (closeStep) {
        // mark the step as "closed" since we can assume
        // it's been added or removed by the updateQuery
        handleStepClose(step.id);
      }
    },
    [question, updateQuestion, handleStepClose],
  );

  if (!question) {
    return null;
  }

  return (
    <Container className={className}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const isLastOpened = lastOpenedStep === step.id;
        const onChange = (
          query: StructuredQuery | Query,
          opts?: UpdateQueryOpts,
        ) => handleQueryChange(step, query, opts);

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
            readOnly={readOnly}
          />
        );
      })}
    </Container>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NotebookSteps;
