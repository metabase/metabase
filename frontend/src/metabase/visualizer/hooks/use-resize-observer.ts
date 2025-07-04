import { useEffect, useRef, useState } from "react";

/**
 * Convenience hook to use ResizeObserver to get the size of an element.
 * This flavor of useResizeObserver is designed to return the border box size
 * of the element it observes, as opposed to other similar hooks that return the content box size.
 *
 * @returns A tuple containing a ref to be attached to an element and the size of that element.
 */
export function useResizeObserver<T extends HTMLElement>() {
  const [size, setSize] = useState(new DOMRectReadOnly(0, 0, 0, 0));
  const ref = useRef<T | null>(null);

  useEffect(() => {
    let observer: ResizeObserver | undefined;

    if (ref.current) {
      observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        // Using getBoundingClientRect() because we need the border box size
        // In terms of performance, it's similar to using contentRect anyway
        setSize(entry.target.getBoundingClientRect());
      });
      observer.observe(ref.current, {
        // Ensures the observer triggers on border box size changes
        // (but no that contentRect always returns content box)
        box: "border-box",
      });
    }
    return () => {
      if (observer) {
        observer.disconnect();
        observer = undefined;
      }
    };
  }, []);

  return [ref, size] as const;
}
