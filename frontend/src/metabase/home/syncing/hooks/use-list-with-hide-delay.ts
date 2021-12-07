import { useRef, useState, useEffect } from "react";

const useListWithHideDelay = <T>(list: T[], delay: number) => {
  const { current: map } = useRef(new Map());
  const [, rerender] = useState({});

  list.forEach(item => {
    const timeout = map.get(item);
    timeout && clearTimeout(timeout);
    map.set(item, null);
  });

  map.forEach((timeout, item) => {
    if (!list.includes(item) && !timeout) {
      const handler = () => {
        map.delete(item);
        rerender({});
      };

      map.set(item, setTimeout(handler, delay));
    }
  });

  useEffect(() => {
    return () => map.forEach(timeout => clearTimeout(timeout));
  }, [map]);

  return Array.from(map.keys());
};

export default useListWithHideDelay;
