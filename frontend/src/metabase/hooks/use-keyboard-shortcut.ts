import { useEffect } from "react";

export function useKeyboardShortcut(
  key: string,
  callback: (e: KeyboardEvent) => void,
) {
  useEffect(() => {
    function keyboardListener(e: KeyboardEvent) {
      if (e.key === key) {
        callback(e);
      }
    }
    document.addEventListener("keyup", keyboardListener);
    return () => {
      document.removeEventListener("keyup", keyboardListener);
    };
  });
}
