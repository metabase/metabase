import { useState } from "react";

export const DEFAULT_LIST_LIMIT = 5;

export const useExpandableList = (arr: any[], limit = DEFAULT_LIST_LIMIT) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const toggle = () => setIsExpanded(val => !val);
  const filtered = isExpanded ? arr : arr.slice(0, limit);
  return { isExpanded, toggle, filtered };
};
