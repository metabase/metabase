import {
  type Context,
  type PropsWithChildren,
  createContext,
  useContext,
  useState,
} from "react";

const ShadowRootContext = createContext({}) as unknown as Context<{
  rootElement: HTMLDivElement | null;
}>;

export function useShadowRoot() {
  return useContext(ShadowRootContext);
}

export const ShadowRootProvider = ({ children }: PropsWithChildren) => {
  const [rootElement, setRootElement] = useState<HTMLDivElement | null>(null);

  return (
    <ShadowRootContext.Provider value={{ rootElement }}>
      <div
        ref={(el) => {
          if (el) {
            setRootElement(el);
          }
        }}
      >
        {children}
      </div>
    </ShadowRootContext.Provider>
  );
};
