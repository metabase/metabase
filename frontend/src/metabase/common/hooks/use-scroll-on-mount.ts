import { useEffect, useRef } from "react";

export const useScrollOnMount = <T extends HTMLElement = HTMLElement>() => {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollIntoView?.({ block: "center" });
    }
  }, []);

  return ref;
};
