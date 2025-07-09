import { useCallback, useState } from "react";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { Button, Card, Menu, Switch, Textarea } from "metabase/ui";

import { addGenerativeQuestion } from "../redux/generativeQuestionsSlice";
import { getGenerativeQuestionsList } from "../redux/selectors";

import {
  QuestionsPageContainer,
  QuestionsPageContent,
  QuestionsPageSidebar,
} from "./QuestionsPage.styled";

interface QuestionsPageProps {
  router: {
    push: (path: string) => void;
  };
}

const QuestionsPage = ({ router }: QuestionsPageProps): JSX.Element => {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [background, setBackground] = useState(false);
  const dispatch = useDispatch();
  const generativeQuestions = useSelector(getGenerativeQuestionsList);

  const handleAskClick = useCallback(() => {
    if (!promptText.trim()) return;

    // Only set transition if not background
    if (!background) {
      setIsTransitioning(true);
    }

    // Generate a UUID for the question
    const questionId = crypto.randomUUID();

    // Add to Redux store
    dispatch(addGenerativeQuestion({
      id: questionId,
      prompt: promptText.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      loading: background,
    }));

    if (!background) {
      // Wait for fade-out animation before navigating
      setTimeout(() => {
        router.push(`/questions/${questionId}`);
      }, 300);
    } else {
      // Immediately clear prompt for background
      setPromptText("");
    }
  }, [router, promptText, dispatch, background]);

  return (
    <QuestionsPageContainer
      style={{
        opacity: isTransitioning ? 0 : 1,
        transform: isTransitioning ? "translateY(-10px)" : "translateY(0)",
        transition: "opacity 0.3s ease-out, transform 0.3s ease-out",
      }}
    >
      <QuestionsPageContent>
        <h1>{t`Questions`}</h1>
        <p>{t`Ask me anything about your data. I'll help you create questions and find insights.`}</p>
        <Card shadow="none" withBorder style={{ marginTop: "1rem" }}>
          <Textarea
            placeholder={t`Describe what you want to know about your data...`}
            minRows={10}
            maxRows={20}
            style={{ width: "100%" }}
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: "1rem",
              borderTop: "1px solid var(--mb-color-border)",
              marginTop: "1rem",
            }}
          >
            <Menu>
              <Menu.Target>
                <Button variant="subtle" size="sm">
                  {t`Select Agent`}
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item>{t`Data Analyst`}</Menu.Item>
                <Menu.Item>{t`SQL Expert`}</Menu.Item>
                <Menu.Item>{t`Business Intelligence`}</Menu.Item>
                <Menu.Item>{t`Data Scientist`}</Menu.Item>
              </Menu.Dropdown>
            </Menu>
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <span
                style={{
                  fontSize: "0.875rem",
                  color: "var(--mb-color-text-medium)",
                }}
              >
                {t`Background`}
              </span>
              <Switch checked={background} onChange={() => setBackground((b) => !b)} />
              <Button
                variant="primary"
                size="sm"
                onClick={handleAskClick}
                disabled={isTransitioning || !promptText.trim()}
              >
                {t`Ask`}
              </Button>
            </div>
          </div>
        </Card>
      </QuestionsPageContent>

      <QuestionsPageSidebar>
        <h3 style={{ marginBottom: "1rem", fontSize: "1.1rem", fontWeight: "600" }}>
          {t`Recent Questions`}
        </h3>
        {generativeQuestions.length === 0 ? (
          <p style={{ color: "var(--mb-color-text-medium)", fontSize: "0.875rem" }}>
            {t`No questions yet. Start by asking something above!`}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {generativeQuestions.slice(0, 10).map((question) => (
              <Card
                key={question.id}
                shadow="none"
                withBorder
                style={{ cursor: "pointer", position: "relative" }}
                onClick={() => !question.loading && router.push(`/questions/${question.id}`)}
              >
                <div style={{ padding: "0.75rem" }}>
                  <div style={{ fontSize: "0.875rem", fontWeight: "500", marginBottom: "0.25rem" }}>
                    {question.title || question.prompt.slice(0, 50) + (question.prompt.length > 50 ? "..." : "")}
                    {question.loading && (
                      <span style={{ marginLeft: 8, verticalAlign: "middle" }}>
                        <span className="spinner" style={{ display: "inline-block", width: 16, height: 16, border: "2px solid #ccc", borderTop: "2px solid var(--mb-color-brand)", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--mb-color-text-medium)" }}>
                    {new Date(question.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </QuestionsPageSidebar>
    </QuestionsPageContainer>
  );
};

// Add spinner animation CSS
const style = document.createElement('style');
style.innerHTML = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
document.head.appendChild(style);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionsPage;
