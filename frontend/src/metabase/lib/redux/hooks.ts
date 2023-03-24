import type { AnyAction } from "redux";
import {
  useDispatch as useDispatchOriginal,
  useSelector as useSelectorOriginal,
} from "react-redux";
import type { TypedUseSelectorHook } from "react-redux";

import type { State } from "metabase-types/store";

// Note (EmmadUsmani): This interface is simply to keep typescript from erroring when
// typing `useDispatch`. Insipiration was taken from `redux-thunk`'s `ThunkDispatch` type
// (https://github.com/reduxjs/redux-thunk/blob/e3d452948d5562b9ce871cc9391403219f83b4ff/src/types.ts#L14).
// It is intentionally vague, we have middlewares that support more action types that are not covered here
// (https://github.com/metabase/metabase/blob/06599e646c3e03462402474b5fc17cd2bf25cb79/frontend/src/metabase/store.js#L34).
// Feel free to improve this if you run into issues.
interface AppDispatch {
  (thunk: (dispatch: AppDispatch, getState: () => State) => void): void;
  (action: AnyAction): AnyAction;
}

export const useDispatch: () => AppDispatch = useDispatchOriginal;
export const useSelector: TypedUseSelectorHook<State> = useSelectorOriginal;
