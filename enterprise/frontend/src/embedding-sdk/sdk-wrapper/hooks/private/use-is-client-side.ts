import { useEffect, useState } from "react";

export const useIsClientSide = () => {
  const [isClientSide, setIsClientSide] = useState(false);

  useEffect(() => {
    setIsClientSide(true);
  }, []);

  return isClientSide;
};
