import { SDK_PACKAGE_NAME } from "embedding-sdk/cli/constants/config";

export const CREATE_QUESTION_SNIPPET = `
import { useState } from 'react'
import { InteractiveQuestion } from '${SDK_PACKAGE_NAME}'

export const CreateQuestion = () => {
  // The questionId is undefined at first.
  // Once the question is saved, we set the questionId to the saved question's id.
  const [questionId, setQuestionId] = useState(undefined)

  const [isVisualizationView, setIsVisualizationView] = useState(false)
  const [isSaveModalOpen, setSaveModalOpen] = useState(false)
  const [isVisualizationReady, setIsVisualizationReady] = useState(false)

  return (
    <InteractiveQuestion
      questionId={questionId}
      onSave={(question) => {
        setQuestionId(question.id())
        setSaveModalOpen(false)
      }}
      isSaveEnabled
    >
      <div className="create-question-container">
        <div className="create-question-header">
          <div>
            <InteractiveQuestion.Title />
          </div>

          <div className="create-question-button-group">
            {isVisualizationReady && (
              <button
                onClick={() => setIsVisualizationView(!isVisualizationView)}
              >
                Show {isVisualizationView ? 'editor' : 'visualization'}
              </button>
            )}

            <button onClick={() => setSaveModalOpen(true)}>Save</button>
          </div>
        </div>

        {isVisualizationReady && isVisualizationView && (
          <div style={{height: '500px'}}>
            <InteractiveQuestion.QuestionVisualization />
          </div>
        )}

        {!isVisualizationView && (
          <InteractiveQuestion.Editor
            onApply={() => {
              setIsVisualizationView(true)
              setIsVisualizationReady(true)
            }}
          />
        )}

        {isSaveModalOpen && (
          <div className="create-question-save-modal">
            <div className="modal-inner">
              <InteractiveQuestion.SaveQuestionForm
                onClose={() => setSaveModalOpen(false)}
              />
            </div>
          </div>
        )}
      </div>
    </InteractiveQuestion>
  )
}
`;
