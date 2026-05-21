import { useEffect, useState } from "react";

/**
 * Returns false when the user has explicitly opted into Data Saver mode
 * (`navigator.connection.saveData`). Prefetching off-screen content
 * defeats the purpose of that signal. Defaults to true when the Network
 * Information API is unavailable.
 */
export function useIsPrefetchAllowed(): boolean {
  const [allowed, setAllowed] = useState(true);

  useEffect(() => {
    const conn = navigator.connection;
    if (!conn) {
      return;
    }
    const update = () => {
      setAllowed(conn.saveData !== true);
    };
    update();
    conn.addEventListener?.("change", update);
    return () => {
      conn.removeEventListener?.("change", update);
    };
  }, []);

  return allowed;
}
