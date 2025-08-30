import { InteractiveQuestion } from "@metabase/embedding-sdk-react";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

const defaultQuestionId = 24;

export default function StaticDashboardPage() {
  const searchParams = useSearchParams();

  const questionId = useMemo(() => {
    const questionIdFromQuery = searchParams.get("questionId");
    return questionIdFromQuery
      ? parseInt(questionIdFromQuery)
      : defaultQuestionId;
  }, [searchParams]);

  return (
    <main style={{ padding: "1rem" }}>
      <h1 style={{ marginBottom: "4rem" }}>Interactive Question Example</h1>
      <InteractiveQuestion questionId={questionId} />
    </main>
  );
}
