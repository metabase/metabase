import "./ResultsDropdown.css"

export function ResultsDropdown({
  data,
  selectedQuestion,
  setSelectedQuestion,
}) {
  return (
    <div className="ResultsDropdown--container">
      <ul className="ResultsDropdown--result-list">
        {data.map(q => (
          <li
            key={q.id}
            onClick={() => {
              setSelectedQuestion(q);
            }}
            className={`ResultsDropdown--list-item ${
              selectedQuestion?.id === q.id
                ? "tw-bg-blue-500"
                : "hover:tw-cursor-pointer hover:tw-bg-gray-400 hover:tw-font-bold"
            }`}
          >
            {q.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
