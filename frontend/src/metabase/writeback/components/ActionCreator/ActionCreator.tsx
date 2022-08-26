import React, { useState, useEffect } from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import { getMetadata } from "metabase/selectors/metadata";
import type NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import type { State } from "metabase-types/store";
import type Question from "metabase-lib/lib/Question";
import type Metadata from "metabase-lib/lib/metadata/Metadata";

import SaveActionModal from "./SaveActionModal";
import { ActionCreatorHeader } from "./ActionCreatorHeader";
import { QueryActionEditor } from "./QueryActionEditor";
import { FormCreator } from "./FormCreator";

import {
  ActionCreatorRoot,
  ActionCreatorBodyContainer,
} from "./ActionCreator.styled";

import { newQuestion } from "./utils";

const mapStateToProps = (state: State) => ({
  metadata: getMetadata(state),
});

function ActionCreatorComponent({
  metadata,
  question: passedQuestion,
}: {
  metadata: Metadata;
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

  const query = question.query() as NativeQuery;

  return (
    <ActionCreatorRoot>
      <ActionCreatorHeader
        type="query"
        name={question.displayName() ?? t`New Action`}
        onChangeName={newName => setQuestion(q => q.setDisplayName(newName))}
        onSave={() => setShowSaveModal(true)}
        canSave={question.query().canRun()}
      />
      <ActionCreatorBodyContainer>
        <QueryActionEditor question={question} setQuestion={setQuestion} />
        <FormCreator tags={query?.templateTagsWithoutSnippets()} />
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

export const ActionCreator = connect(mapStateToProps)(ActionCreatorComponent);
