import { useCallback } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { SET_TEMP_SETTING } from "metabase/redux/app";
import type { State, TempStorage } from "metabase-types/store";

type TempStorageKey = keyof TempStorage;
type TempStorageValue<Key extends TempStorageKey> = TempStorage[Key];

export const useTempStorage = <Key extends TempStorageKey>(
  key: Key,
): [TempStorageValue<Key>, (newValue: TempStorageValue<Key>) => void] => {
  const dispatch = useDispatch();

  const value = useSelector((state: State) => state.app[key]);

  const setValue = useCallback(
    (newValue: TempStorageValue<Key>) => {
      dispatch({ type: SET_TEMP_SETTING, payload: { key, value: newValue } });
    },
    [dispatch, key],
  );

  return [value, setValue];
};
