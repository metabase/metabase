import { useState, useEffect } from "react";

// FIXME: REMOVE THIS TEMPORARY PROTOTYPING CODE
export const useRerenderOnShortcut = () => {
  // For triggering rerenders
  const [value, setValue] = useState(0);

  useEffect(() => {
    const onKeyDown = (_e: KeyboardEvent) => {
      setTimeout(() => {
        setValue(val => val + 1);
      }, 0);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return value;
};
