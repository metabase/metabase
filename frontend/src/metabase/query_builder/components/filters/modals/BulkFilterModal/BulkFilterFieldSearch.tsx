import { useEffect, useRef } from "react";
import { t } from "ttag";

import {
  SearchContainer,
  SearchInput,
  SearchIcon,
} from "./BulkFilterModal.styled";

export const FieldSearch = ({
  value,
  onChange,
  isExpanded,
  setIsExpanded,
}: {
  value: string;
  onChange: (value: string) => void;
  isExpanded: boolean;
  setIsExpanded: (isExpanded: boolean) => void;
}): JSX.Element => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const shouldClose = () => {
    const input = inputRef.current;
    const isFocused = document.activeElement === input;

    if (input && !input.value && !isFocused) {
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (isExpanded) {
      inputRef.current?.focus();
    }
  }, [isExpanded]);

  return (
    <SearchContainer
      isActive={isExpanded}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => shouldClose() && setIsExpanded(false)}
    >
      <SearchIcon
        name="search"
        isActive={isExpanded}
        onClick={() => setIsExpanded(!isExpanded)}
      />
      <SearchInput
        ref={inputRef}
        isActive={isExpanded}
        type="search"
        placeholder={t`Search for a column...`}
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => shouldClose() && setIsExpanded(false)}
      />
    </SearchContainer>
  );
};
