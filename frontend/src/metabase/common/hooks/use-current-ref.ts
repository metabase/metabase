import { useRef } from "react";

export const useCurrentRef = function <T>(value: T) {
  const ref = useRef(value);
  ref.current = value;

  return ref;
};
