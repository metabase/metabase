import { useState, useLayoutEffect } from "react";

const HIDE_DELAY = 6000;

const useStatusVisibility = (isActive: boolean) => {
  const [isVisible, setIsVisible] = useState(isActive);

  useLayoutEffect(() => {
    if (isActive) {
      setIsVisible(true);
    } else {
      const timeout = setTimeout(() => setIsVisible(false), HIDE_DELAY);
      return () => clearTimeout(timeout);
    }
  }, [isActive]);

  return isVisible;
};

export default useStatusVisibility;
