import React, { useEffect, useCallback, useState, useRef } from "react";

export function useHover<T extends HTMLElement>(): [
  React.RefObject<T>,
  boolean,
] {
  const [isHovered, setHovered] = useState(false);
  const ref = useRef<T>(null);

  const onMouseOver = useCallback(() => setHovered(true), []);
  const onMouseOut = useCallback(() => setHovered(false), []);

  useEffect(() => {
    const node = ref.current;
    if (node) {
      node.addEventListener("mouseover", onMouseOver);
      node.addEventListener("mouseout", onMouseOut);
      return () => {
        node.removeEventListener("mouseover", onMouseOver);
        node.removeEventListener("mouseout", onMouseOut);
      };
    }
  }, [onMouseOut, onMouseOver]);

  return [ref, isHovered];
}
