import { useQuestionSearch } from "metabase-embedding-sdk";

export const QuestionList = ({
  selectedQuestionId,
  setSelectedQuestionId,
  className,
  style,
}) => {
  const { data = [], metadata, isLoading } = useQuestionSearch();

  return (
    <div style={style} className={className}>
      {isLoading ? (
        <div>Loading...</div>
      ) : (
        <>
          <div style={{ fontWeight: "bold", textDecoration: "underline" }}>
            You have {metadata.total} questions.
          </div>
          <ul>
            {data.map(question => (
              <li
                onClick={() => setSelectedQuestionId(question.id)}
                key={question.id}
                className={
                  "QuestionList-item" +
                  (question.id === selectedQuestionId
                    ? " QuestionList-item--selected"
                    : "")
                }
              >
                {question.name}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};
