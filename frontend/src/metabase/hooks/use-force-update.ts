import { useReducer } from "react";

// https://reactjs.org/docs/hooks-faq.html#is-there-something-like-forceupdate
export function useForceUpdate() {
  const [, forceUpdate] = useReducer(x => x + 1, 0);
  return forceUpdate;
}
