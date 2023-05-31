import { useState } from "react";

type useFocusReturn = {
  isFocused: boolean;
  toggleFocusOn: () => void;
  toggleFocusOff: () => void;
};

export const useFocus = (initialState = false): useFocusReturn => {
  const [isFocused, setFocused] = useState(initialState);

  return {
    isFocused,
    toggleFocusOn: () => setFocused(true),
    toggleFocusOff: () => setFocused(false),
  };
};
