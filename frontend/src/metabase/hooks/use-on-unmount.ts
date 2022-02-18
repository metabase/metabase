import { useEffect, useRef } from "react";

export function useOnUnmount(cb: () => void) {
  const cbRef = useRef(cb);
  cbRef.current = cb;

  useEffect(() => {
    return () => {
      cbRef.current();
    };
  }, []);
}
