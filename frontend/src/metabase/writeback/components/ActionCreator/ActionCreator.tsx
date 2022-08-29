import React, { useState, useEffect } from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import { getMetadata } from "metabase/selectors/metadata";
import Actions from "metabase/entities/actions";

import type NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import type { State } from "metabase-types/store";
import type Question from "metabase-lib/lib/Question";
import type Metadata from "metabase-lib/lib/metadata/Metadata";
import type { WritebackAction } from "metabase/writeback/types";

import Modal from "metabase/components/Modal";

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

  const afterSave = (action: WritebackAction) => {
    setQuestion(
      question.setDisplayName(action.name).setDescription(action.description),
    );
    setTimeout(() => setShowSaveModal(false), 1000);
  };

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
        <Modal>
          <Actions.ModalForm
            form={Actions.forms.saveForm}
            action={{
              name: question.displayName(),
              description: question.description(),
              collection_id: question.collectionId(),
              question,
            }}
            onSaved={afterSave}
            onClose={() => setShowSaveModal(false)}
          />
        </Modal>
      )}
    </ActionCreatorRoot>
  );
}

export const ActionCreator = connect(mapStateToProps)(ActionCreatorComponent);
