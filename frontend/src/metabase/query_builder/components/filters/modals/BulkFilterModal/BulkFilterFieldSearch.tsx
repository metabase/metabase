import React, { useEffect, useState, useRef } from "react";
import { t } from "ttag";

import { useMount } from "react-use";

import {
  SearchContainer,
  SearchInput,
  SearchIcon,
} from "./BulkFilterModal.styled";

export const FieldSearch = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}): JSX.Element => {
  const [showSearch, setShowSearch] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useMount(() => {
    const searchToggleListener = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        setShowSearch(true);
      }
    };
    window.addEventListener("keydown", searchToggleListener);
    return () => window.removeEventListener("keydown", searchToggleListener);
  });

  const shouldClose = () => {
    const input = inputRef.current;
    const isFocused = document.activeElement === input;

    if (input && !input.value && !isFocused) {
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (showSearch) {
      inputRef.current?.focus();
    }
  }, [showSearch]);

  return (
    <SearchContainer
      isActive={showSearch}
      onMouseEnter={() => setShowSearch(true)}
      onMouseLeave={e => shouldClose() && setShowSearch(false)}
    >
      <SearchIcon
        name="search"
        onClick={() => setShowSearch(lastShowSearch => !lastShowSearch)}
      />
      <SearchInput
        ref={inputRef}
        isActive={showSearch}
        type="search"
        placeholder={t`Search for a column...`}
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => shouldClose() && setShowSearch(false)}
      />
    </SearchContainer>
  );
};
