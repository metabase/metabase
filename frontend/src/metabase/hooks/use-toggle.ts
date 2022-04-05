import { useState, useCallback } from "react";

type ToggleHookResult = [
  boolean,
  { turnOn: () => void; turnOff: () => void; toggle: () => void },
];

export function useToggle(initialValue = false): ToggleHookResult {
  const [value, setValue] = useState(initialValue);

  const turnOn = useCallback(() => setValue(true), []);

  const turnOff = useCallback(() => setValue(false), []);

  const toggle = useCallback(() => setValue(current => !current), []);

  return [value, { turnOn, turnOff, toggle }];
}
