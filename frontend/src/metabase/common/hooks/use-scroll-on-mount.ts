import { useEffect, useRef } from "react";

export function useScrollOnMount<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: "center" });
  }, []);

  return ref;
}
