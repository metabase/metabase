import { useEffect, RefObject } from "react";

interface ValidRefTarget {
  contains(target: EventTarget | null): boolean;
}

export function useOnOutsideClick<T extends ValidRefTarget = HTMLDivElement>(
  ref: RefObject<T>,
  callback: () => void,
) {
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && event.target && !ref.current.contains(event.target)) {
        callback();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [ref, callback]);
}
