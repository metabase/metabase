import { useRef, useEffect } from "react";

export const useScrollOnMount = () => {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollIntoView({ block: "center" });
    }
  }, []);

  return ref;
};
