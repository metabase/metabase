import { useEffect, useRef, useState } from "react";

export function useHeightAboveFold() {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    function handleResize() {
      if (!ref.current) {
        return;
      }

      const rect = ref.current.getBoundingClientRect();
      const height = window.innerHeight - rect.top;
      setHeight(height);
    }

    handleResize();

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [ref]);

  return { ref, height };
}
