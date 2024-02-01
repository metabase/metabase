import { useQuestionSearch } from "metabase-embedding-sdk";

export const QuestionList = ({
  selectedQuestionId,
  setSelectedQuestionId,
  className,
}) => {
  const { data, isLoading } = useQuestionSearch();

  return (
    <div className={className}>
      {isLoading && !data ? (
        <div>Loading...</div>
      ) : (
        <>
          <div>Select a question:</div>

          <ul
            style={{
              marginLeft: "-0.5rem",
            }}
          >
            {data?.map(question => (
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
