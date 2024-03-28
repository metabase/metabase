import { useEffect, useState } from "react";

export const useRecentlyTrue = (bool: boolean, delay = 500) => {
  const [wasEverTrue, setWasEverTrue] = useState(false);
  const [wasRecentlyTrue, setWasRecentlyTrue] = useState(false);

  useEffect(() => {
    if (bool) {
      setWasEverTrue(true);
    } else {
      if (wasEverTrue) {
        setWasRecentlyTrue(true);
        const timeout = setTimeout(() => {
          setWasRecentlyTrue(false);
        }, delay);
        return () => clearTimeout(timeout);
      }
    }
  }, [bool, wasEverTrue, delay]);

  return [wasRecentlyTrue, wasEverTrue];
};
