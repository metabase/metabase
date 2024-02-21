import "./QuestionSearchBar.css"

export function QuestionSearchBar({ onChange, onClick, onFocus, value }) {
  return (
    <div className="QuestionSearchBar--container">
      <input
        className="QuestionSearchBar--input"
        type="text"
        placeholder="Search for a question"
        value={value}
        onChange={onChange}
        onFocus={onFocus} // Show dropdown on input focus
      />
      <button
        className="QuestionSearchBar--button"
        type="button"
        onClick={onClick}
      >
        Search
      </button>
    </div>
  );
}
