import { useRef, useEffect } from "react";

export const useScrollOnMount = () => {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollIntoView?.({ block: "center" });
    }
  }, []);

  return ref;
};
