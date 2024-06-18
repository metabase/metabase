import { useEffect, useState } from "react";

export const useRecentlyTrue = (booleanVariable: boolean, delay = 500) => {
  const [wasEverTrue, setWasEverTrue] = useState(false);
  const [wasRecentlyTrue, setWasRecentlyTrue] = useState(false);

  useEffect(() => {
    if (booleanVariable) {
      setWasEverTrue(true);
    } else if (wasEverTrue) {
      setWasRecentlyTrue(true);
      const timeout = setTimeout(() => {
        setWasRecentlyTrue(false);
      }, delay);
      return () => clearTimeout(timeout);
    }
  }, [booleanVariable, wasEverTrue, delay]);

  return [wasRecentlyTrue, wasEverTrue];
};
