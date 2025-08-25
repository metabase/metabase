import {
  type PropsWithChildren,
  type ReactNode,
  useEffect,
  useState,
} from "react";

type Props = {
  ssrFallback: ReactNode;
};

export const ClientSideOnlyWrapper = ({
  children,
  ssrFallback,
}: PropsWithChildren<Props>) => {
  const [isClientSide, setIsClientSide] = useState(false);

  useEffect(() => {
    setIsClientSide(true);
  }, []);

  return isClientSide ? children : ssrFallback;
};
