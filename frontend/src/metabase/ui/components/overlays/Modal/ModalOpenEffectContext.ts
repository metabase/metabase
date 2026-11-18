import { createContext, useContext, useEffect } from "react";

/** Runs when a `Modal` opens or closes; may return a cleanup. */
export type ModalOpenEffect = (opened: boolean) => void | (() => void);

export const ModalOpenEffectContext = createContext<ModalOpenEffect | null>(
  null,
);

export const ModalOpenEffectProvider = ModalOpenEffectContext.Provider;

export const useModalOpenEffect = (opened: boolean) => {
  const effect = useContext(ModalOpenEffectContext);

  useEffect(() => effect?.(opened), [effect, opened]);
};
