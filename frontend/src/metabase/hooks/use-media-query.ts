import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const useMediaQuery = (query: string) => {
  const queryList = useMemo(() => window.matchMedia(query), [query]);
  const [isMatched, setIsMatched] = useState(queryList.matches);

  const handleChange = useCallback((event: MediaQueryListEvent) => {
    setIsMatched(event.matches);
  }, []);

  useEffect(() => {
    queryList.addEventListener("change", handleChange);
    return () => queryList.removeEventListener("change", handleChange);
  }, [queryList, handleChange]);

  return isMatched;
};

export default useMediaQuery;
