import { useCallback, useEffect, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";
import { Button, Card, Skeleton, Textarea } from "metabase/ui";

import { addGenerativeQuestion, createQuestionMetadata, generateSampleContent } from "../redux/generativeQuestionsSlice";
import { getGenerativeQuestionById } from "../redux/selectors";

import { MarkdownRenderer } from "./MarkdownRenderer";
import {
  QuestionResponseContent,
  QuestionResponsePageContainer,
  QuestionResponseSidebar,
} from "./QuestionResponsePage.styled";

interface QuestionResponsePageProps {
  params: {
    questionId: string;
  };
}

const QuestionResponsePage = ({
  params,
}: QuestionResponsePageProps): JSX.Element => {
  const { questionId } = params;
  const [isLoading, setIsLoading] = useState(true);
  const [showTitle, setShowTitle] = useState(false);
  const [showContent, setShowContent] = useState(false);

  const dispatch = useDispatch();
  const currentUser = useSelector(getUser);
  const question = useSelector((state) =>
    getGenerativeQuestionById(state, questionId),
  );

  const handleStartNewQuestion = useCallback(
    (selectedText: string) => {
      const newQuestionId = crypto.randomUUID();

      dispatch(
        addGenerativeQuestion({
          id: newQuestionId,
          prompt: selectedText,
          agentType: "Metabot: Your general purpose analyst",
          content: generateSampleContent(selectedText),
          metadata: createQuestionMetadata(currentUser, "Metabot: Your general purpose analyst"),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
      );

      // Navigate to the new question using Redux router
      dispatch(push(`/questions/${newQuestionId}`));
    },
    [dispatch, currentUser],
  );

  // Use the prompt from the Redux store as the title
  const generatedTitle = question?.prompt || "Sales Performance Analysis for Q4 2023";
  const generatedContent = question?.content || "No content available";

  const handleTextNodeClick = (_nodeId: string, _text: string) => {
    // TODO: Implement follow-up question functionality
    // This could open a modal, add to chat, or highlight the text
    // For now, we can use the nodeId and text to generate follow-up questions
  };

  const handleSelectionChange = (_selectedNodes: string[]) => {
    // TODO: Handle selection changes
    // This could update the UI to show selection count, enable/disable actions, etc.
    // console.log("Selected nodes:", selectedNodes);
  };

  useEffect(() => {
    // Simulate loading time
    const loadingTimer = setTimeout(() => {
      setIsLoading(false);
      // Show title after a short delay
      setTimeout(() => setShowTitle(true), 300);
      // Show content after title appears
      setTimeout(() => setShowContent(true), 600);
    }, 1500);

    return () => clearTimeout(loadingTimer);
  }, []);

  return (
    <QuestionResponsePageContainer
      style={{
        opacity: isLoading ? 0 : 1,
        transition: "opacity 0.5s ease-in-out",
      }}
    >
      <QuestionResponseContent
        style={{
          opacity: showContent ? 1 : 0,
          transform: showContent ? "translateY(0)" : "translateY(20px)",
          transition: "opacity 0.6s ease-out, transform 0.6s ease-out",
        }}
      >
        <Card shadow="none" withBorder>
          <div style={{ padding: "1.5rem" }}>
            {showTitle ? (
              <h1
                style={{
                  marginBottom: "1rem",
                  fontSize: "1.5rem",
                  fontWeight: "600",
                  opacity: 1,
                  transform: "translateY(0)",
                  transition: "opacity 0.4s ease-out, transform 0.4s ease-out",
                }}
              >
                {generatedTitle}
              </h1>
            ) : (
              <Skeleton
                height={32}
                width="60%"
                style={{ marginBottom: "1rem" }}
              />
            )}
            {/* Authors Info */}
            {question?.metadata?.authors && question.metadata.authors.length > 0 && (
              <div
                style={{
                  marginBottom: "1rem",
                  padding: "0.75rem",
                  backgroundColor: "var(--mb-color-bg-light)",
                  borderRadius: "0.375rem",
                  fontSize: "0.875rem",
                }}
              >
                <div style={{ marginBottom: "0.5rem", fontWeight: "500", color: "var(--mb-color-text-medium)" }}>
                  {t`Authors`}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {question.metadata.authors.map((author) => (
                    <span
                      key={author.id}
                      style={{
                        padding: "0.25rem 0.5rem",
                        backgroundColor: author.type === "user" ? "var(--mb-color-brand)" : "var(--mb-color-bg-medium)",
                        color: author.type === "user" ? "white" : "var(--mb-color-text-dark)",
                        borderRadius: "0.25rem",
                        fontSize: "0.75rem",
                        fontWeight: "500",
                      }}
                    >
                      {author.name}
                      {author.role && (
                        <span style={{ marginLeft: "0.25rem", opacity: 0.8 }}>
                          ({author.role})
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div
              style={{
                opacity: showContent ? 1 : 0,
                transform: showContent ? "translateY(0)" : "translateY(10px)",
                transition: "opacity 0.4s ease-out, transform 0.4s ease-out",
                transitionDelay: "0.2s",
              }}
            >
              <MarkdownRenderer
                content={generatedContent}
                onTextNodeClick={handleTextNodeClick}
                onSelectionChange={handleSelectionChange}
                onStartNewQuestion={handleStartNewQuestion}
              />
            </div>
          </div>
        </Card>
      </QuestionResponseContent>

      <QuestionResponseSidebar
        style={{
          opacity: showContent ? 1 : 0,
          transform: showContent ? "translateX(0)" : "translateX(20px)",
          transition: "opacity 0.6s ease-out, transform 0.6s ease-out",
          transitionDelay: "0.3s",
        }}
      >
        <Card shadow="none" withBorder>
          <div style={{ padding: "1rem" }}>
            <h3
              style={{
                marginBottom: "1rem",
                fontSize: "1.1rem",
                fontWeight: "600",
              }}
            >
              {t`Agent Chat`}
            </h3>

            {/* Prompt Card */}
            <Card
              shadow="none"
              withBorder
              style={{
                marginBottom: "1rem",
                backgroundColor: "var(--mb-color-bg-light)",
              }}
            >
              <div style={{ padding: "0.75rem" }}>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--mb-color-text-medium)",
                    marginBottom: "0.25rem",
                    fontWeight: "500",
                  }}
                >
                  {t`Question`}
                </div>
                <div style={{ fontSize: "0.875rem", lineHeight: "1.4" }}>
                  {question?.prompt || t`No question available`}
                </div>
              </div>
            </Card>
            <div
              style={{
                height: "300px",
                border: "1px solid var(--mb-color-border)",
                borderRadius: "0.375rem",
                padding: "0.75rem",
                marginBottom: "1rem",
                overflowY: "auto",
                backgroundColor: "var(--mb-color-bg-light)",
              }}
            ></div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Textarea
                placeholder={t`Ask a follow-up question...`}
                minRows={2}
                maxRows={4}
                style={{ flex: 1 }}
              />
              <Button
                variant="primary"
                size="sm"
                style={{ alignSelf: "flex-end" }}
              >
                {t`Send`}
              </Button>
            </div>
          </div>
        </Card>
      </QuestionResponseSidebar>
    </QuestionResponsePageContainer>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionResponsePage;
