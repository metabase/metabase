import { useCallback } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { SET_TEMP_SETTING } from "metabase/redux/app";
import type {
  State,
  TempStorageKey,
  TempStorageValue,
} from "metabase-types/store";

export const useTempStorage = <Key extends TempStorageKey>(
  key: Key,
): [TempStorageValue<Key>, (newValue: TempStorageValue<Key>) => void] => {
  const dispatch = useDispatch();

  const value = useSelector((state: State) => state.app.tempStorage[key]);

  const setValue = useCallback(
    (newValue: TempStorageValue<Key>) => {
      dispatch({ type: SET_TEMP_SETTING, payload: { key, value: newValue } });
    },
    [dispatch, key],
  );

  return [value, setValue];
};
