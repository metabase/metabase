import { useCallback, useState } from "react";
import { t } from "ttag";

import { Button, Card, Menu, Switch, Textarea } from "metabase/ui";

import {
  QuestionsPageContainer,
  QuestionsPageContent,
} from "./QuestionsPage.styled";

interface QuestionsPageProps {
  router: {
    push: (path: string) => void;
  };
}

const QuestionsPage = ({ router }: QuestionsPageProps): JSX.Element => {
  const [isTransitioning, setIsTransitioning] = useState(false);

  const handleAskClick = useCallback(() => {
    setIsTransitioning(true);

    // Generate a UUID for the question
    const questionId = crypto.randomUUID();

    // Wait for fade-out animation before navigating
    setTimeout(() => {
      router.push(`/questions/${questionId}`);
    }, 300);
  }, [router]);

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
              <Switch />
              <Button
                variant="primary"
                size="sm"
                onClick={handleAskClick}
                disabled={isTransitioning}
              >
                {t`Ask`}
              </Button>
            </div>
          </div>
        </Card>
      </QuestionsPageContent>
    </QuestionsPageContainer>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionsPage;
