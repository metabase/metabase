import { useRef } from "react";

import { uniqueId } from "metabase/utils/unique-id";

export const useUniqueId = (prefix?: string): string => {
  const idRef = useRef("");
  if (!idRef.current) {
    idRef.current = uniqueId(prefix);
  }

  return idRef.current;
};
