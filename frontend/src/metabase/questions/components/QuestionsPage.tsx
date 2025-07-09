import { t } from "ttag";

import { Textarea } from "metabase/ui";

import { QuestionsPageContainer, QuestionsPageContent } from "./QuestionsPage.styled";

const QuestionsPage = (): JSX.Element => {
  return (
    <QuestionsPageContainer>
      <QuestionsPageContent>
        <h1>{t`Questions`}</h1>
        <p>{t`Ask me anything about your data. I'll help you create questions and find insights.`}</p>
        <Textarea
          placeholder={t`Describe what you want to know about your data...`}
          minRows={10}
          maxRows={20}
          style={{ width: "100%", marginTop: "1rem" }}
        />
      </QuestionsPageContent>
    </QuestionsPageContainer>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionsPage;
