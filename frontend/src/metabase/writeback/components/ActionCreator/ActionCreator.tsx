import React, { useState, useEffect } from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import type { ActionType } from "metabase/writeback/types";

import { ActionCreatorHeader } from "./ActionCreatorHeader";
import { QueryActionEditor } from "./QueryActionEditor";
import { FormCreator } from "./FormCreator";

import {
  ActionCreatorRoot,
  ActionCreatorBodyContainer,
} from "./ActionCreator.styled";

import { getMetadata } from "metabase/selectors/metadata";

import type { State } from "metabase-types/store";
import type Question from "metabase-lib/lib/Question";

import { newQuestion } from "./utils";
import SaveActionModal from "./SaveActionModal";

const mapStateToProps = (state: State) => ({
  metadata: getMetadata(state),
});

function ActionCreatorComponent({
  metadata,
  question: passedQuestion,
}: {
  metadata: any;
  question: Question;
}) {
  const [question, setQuestion] = useState(
    passedQuestion ?? newQuestion(metadata),
  );
  const [showSaveModal, setShowSaveModal] = useState(false);

  useEffect(() => {
    setQuestion(passedQuestion ?? newQuestion(metadata));
  }, [metadata, passedQuestion]);

  if (!question || !metadata) {
    return null;
  }

  return (
    <ActionCreatorRoot>
      <ActionCreatorHeader
        type="query"
        name={question.displayName() ?? t`New Action`}
        onChangeName={newName => setQuestion(q => q.setDisplayName(newName))}
        onCommit={() => setShowSaveModal(true)}
        canSave={question.query().canRun()}
      />
      <ActionCreatorBodyContainer>
        <QueryActionEditor question={question} setQuestion={setQuestion} />
        {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
        {/* @ts-ignore */}
        <FormCreator tags={question.query()?.templateTagsWithoutSnippets()} />
      </ActionCreatorBodyContainer>
      {showSaveModal && (
        <SaveActionModal
          question={question}
          onClose={() => setShowSaveModal(false)}
        />
      )}
    </ActionCreatorRoot>
  );
}

export const ActionCreator = connect(
  mapStateToProps,
  null,
)(ActionCreatorComponent);
