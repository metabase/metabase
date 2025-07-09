import { t } from "ttag";

import { Button, Card, Textarea } from "metabase/ui";

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
  const { questionId: _questionId } = params;

  // Placeholder content for now
  const generatedTitle = "Sales Performance Analysis for Q4 2023";
  const generatedContent = `
# Sales Performance Analysis for Q4 2023

## Executive Summary
Based on your data, Q4 2023 showed a **15% increase** in total sales compared to Q3, with the strongest performance coming from the Technology sector.

## Key Findings

### Revenue Growth
- Total revenue: $2.4M (up from $2.1M in Q3)
- Average order value: $1,200 (12% increase)
- Customer acquisition: 450 new customers

### Top Performing Products
1. **Cloud Storage Solutions** - $450K revenue
2. **Data Analytics Platform** - $380K revenue
3. **Security Suite** - $320K revenue

### Regional Performance
- North America: 45% of total sales
- Europe: 32% of total sales
- Asia Pacific: 23% of total sales

## Recommendations

1. **Focus on Technology Sector**: Continue investing in cloud and analytics products
2. **Expand European Market**: Consider localized marketing campaigns
3. **Customer Retention**: Implement loyalty programs for existing customers

## Next Steps

- Schedule follow-up analysis for Q1 2024
- Review pricing strategy for top-performing products
- Plan expansion into emerging markets
`;

  return (
    <QuestionResponsePageContainer>
      <QuestionResponseContent>
        <Card shadow="none" withBorder style={{ height: "100%" }}>
          <div style={{ padding: "1.5rem" }}>
            <h1
              style={{
                marginBottom: "1rem",
                fontSize: "1.5rem",
                fontWeight: "600",
              }}
            >
              {generatedTitle}
            </h1>
            <div
              style={{
                lineHeight: "1.6",
                fontSize: "0.95rem",
              }}
              dangerouslySetInnerHTML={{
                __html: generatedContent
                  .replace(/\n/g, "<br>")
                  .replace(/#{1,6}\s+(.+)/g, "<h2>$1</h2>")
                  .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"),
              }}
            />
          </div>
        </Card>
      </QuestionResponseContent>

      <QuestionResponseSidebar>
        <Card shadow="none" withBorder style={{ height: "100%" }}>
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
            >
              <div
                style={{
                  fontSize: "0.875rem",
                  color: "var(--mb-color-text-medium)",
                }}
              >
                {t`Chat history will appear here...`}
              </div>
            </div>
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
