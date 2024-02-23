import { useQuestionSearch } from "metabase-embedding-sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { ResultsDropdown } from "./ResultsDropdown";
import { QuestionSearchBar } from "./QuestionSearchBar";


export const QuestionSearchDropdown = ({
  selectedQuestion,
  setSelectedQuestion,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [inputValue, setInputValue] = useState("");

  const ref = useRef();

  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const { data, isLoading } = useQuestionSearch(searchTerm);

  const showDropdown = () => {
    setIsDropdownVisible(true);
  };

  const hideDropdown = () => {
    setIsDropdownVisible(false);
  };

  // Close dropdown when user clicks outside the component
  const handleClickOutside = useCallback(event => {
    if (ref.current && !ref.current.contains(event.target)) {
      hideDropdown();
    }
  }, []);

  // Add event listeners for clicking outside the component
  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [handleClickOutside]);

  return (
    <div className="tw-relative" ref={ref}>
      <QuestionSearchBar
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        onFocus={showDropdown}
        onClick={() => {
          setSearchTerm(inputValue);
          showDropdown();
        }}
      />
      {isDropdownVisible && !isLoading && data && data.length > 0 && (
        <ResultsDropdown
          data={data}
          selectedQuestion={selectedQuestion}
          setSelectedQuestion={(q) => {
            setSelectedQuestion(q);
            hideDropdown();
          }}
        />
      )}
    </div>
  );
};
