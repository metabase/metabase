import { useState } from "react";
import { jt, t } from "ttag";

import { Anchor } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { CreateOrEditQuestionAlertModal } from "../modals";
import { ALERT_TYPE_ROWS, getAlertType } from "../utils";

type HasResultsAlertPromptProps = {
  question: Question;
};

export function HasResultsAlertPrompt({
  question,
}: HasResultsAlertPromptProps) {
  const [isModalOpened, setIsModalOpened] = useState(false);

  if (getAlertType(question) !== ALERT_TYPE_ROWS) {
    return null;
  }

  return (
    <>
      <p>
        {jt`You can also ${(
          <Anchor key="link" onClick={() => setIsModalOpened(true)}>
            {t`get an alert`}
          </Anchor>
        )} when there are some results.`}
      </p>
      {isModalOpened && (
        <CreateOrEditQuestionAlertModal
          question={question}
          onClose={() => setIsModalOpened(false)}
          onAlertCreated={() => setIsModalOpened(false)}
        />
      )}
    </>
  );
}
