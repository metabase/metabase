import { useState, useCallback } from "react";

export function useToggle(initialValue = false) {
  const [value, setValue] = useState(initialValue);

  const turnOn = useCallback(() => setValue(true), []);

  const turnOff = useCallback(() => setValue(false), []);

  const toggle = useCallback(() => setValue(current => !current), []);

  return [value, { turnOn, turnOff, toggle }];
}
