import { useRef } from "react";
import _ from "underscore";

export const useUniqueId = (prefix?: string): string => {
  const idRef = useRef("");
  if (!idRef.current) {
    idRef.current = _.uniqueId(prefix);
  }

  return idRef.current;
};
