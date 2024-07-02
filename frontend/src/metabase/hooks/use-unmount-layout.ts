import { useRef, useLayoutEffect } from "react";

// identical to useUnmount from react-use but leverages useLayoutEffect
// instead of useEffect in the case you need access to the DOM elements
// you're about to unmount as part of your cleanup
export const useUnmountLayout = (fn: () => any): void => {
  const fnRef = useRef(fn);

  // update the ref each render so if it change the newest callback will be invoked
  fnRef.current = fn;

  useLayoutEffect(() => () => fnRef.current(), []);
};
