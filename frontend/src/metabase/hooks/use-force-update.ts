import { useState, useCallback } from "react";

export function useForceUpdate() {
  const [, setState] = useState(0);
  const forceUpdate = useCallback(() => setState(i => i + 1), []);

  return forceUpdate;
}
