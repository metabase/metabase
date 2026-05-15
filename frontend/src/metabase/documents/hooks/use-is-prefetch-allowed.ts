import { useEffect, useState } from "react";

type NetworkInformation = {
  saveData?: boolean;
  addEventListener?: (type: "change", cb: () => void) => void;
  removeEventListener?: (type: "change", cb: () => void) => void;
};

/**
 * Returns false when the user has explicitly opted into Data Saver mode
 * (`navigator.connection.saveData`). Prefetching off-screen content
 * defeats the purpose of that signal. Defaults to true when the Network
 * Information API is unavailable.
 */
export function useIsPrefetchAllowed(): boolean {
  const [allowed, setAllowed] = useState(true);

  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: NetworkInformation })
      .connection;
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
