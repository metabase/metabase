import { useCallback, useMemo, useState } from "react";

import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import type { Query } from "metabase-lib";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import NotebookStep from "../NotebookStep";
import { getQuestionSteps } from "../lib/steps";
import type { NotebookStep as INotebookStep, OpenSteps } from "../types";

interface NotebookStepsProps {
  className?: string;
  question: Question;
  sourceQuestion?: Question;
  reportTimezone: string;
  updateQuestion: (question: Question) => Promise<void>;
  readOnly?: boolean;
}

function getInitialOpenSteps(question: Question, readOnly: boolean): OpenSteps {
  const query = question.query();
  const isNew = !readOnly && !Lib.sourceTableOrCardId(query);

  if (isNew) {
    return {
      "0:filter": true,
      "0:summarize": true,
    };
  }

  return {};
}

export function NotebookSteps({
  question,
  reportTimezone,
  updateQuestion,
  readOnly = false,
}: NotebookStepsProps) {
  const metadata = useSelector(getMetadata);
  const [openSteps, setOpenSteps] = useState<OpenSteps>(
    getInitialOpenSteps(question, readOnly),
  );
  const [lastOpenedStep, setLastOpenedStep] = useState<
    INotebookStep["id"] | null
  >(null);

  const steps = useMemo(() => {
    if (!question) {
      return [];
    }
    return getQuestionSteps(question, metadata, openSteps);
  }, [metadata, question, openSteps]);

  const handleStepOpen = useCallback((id: INotebookStep["id"]) => {
    setOpenSteps(openSteps => ({ ...openSteps, [id]: true }));
    setLastOpenedStep(id);
  }, []);

  const handleStepClose = useCallback(
    (id: INotebookStep["id"]) => {
      if (openSteps[id]) {
        setOpenSteps(openSteps => ({ ...openSteps, [id]: false }));
      }
      setLastOpenedStep(lastOpenedStep =>
        lastOpenedStep === id ? null : lastOpenedStep,
      );
    },
    [openSteps],
  );

  const handleQueryChange = useCallback(
    async (query: Query, step: INotebookStep) => {
      const updatedQuestion = question.setQuery(Lib.dropEmptyStages(query));
      await updateQuestion(updatedQuestion);

      // mark the step as "closed" since we can assume
      // it's been added or removed by the updateQuery
      handleStepClose(step.id);
    },
    [question, updateQuestion, handleStepClose],
  );

  if (!question) {
    return null;
  }

  return (
    <>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const isLastOpened = lastOpenedStep === step.id;
        const onChange = async (query: Query) => {
          await handleQueryChange(query, step);
        };

        return (
          <NotebookStep
            key={step.id}
            step={step}
            isLastStep={isLast}
            isLastOpened={isLastOpened}
            reportTimezone={reportTimezone}
            updateQuery={onChange}
            openStep={handleStepOpen}
            readOnly={readOnly}
          />
        );
      })}
    </>
  );
}
