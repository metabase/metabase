import {
  type Context,
  type PropsWithChildren,
  createContext,
  useState,
} from "react";

export const ShadowRootContext = createContext({}) as unknown as Context<{
  rootElement: HTMLElement;
}>;

export const ShadowRootProvider = ({ children }: PropsWithChildren) => {
  const [rootElement, setRootElement] = useState<HTMLElement | null>(null);

  return (
    <div
      ref={(el) => {
        if (el) {
          setRootElement(el);
        }
      }}
      style={{ display: "contents" }}
    >
      {rootElement && (
        <ShadowRootContext.Provider value={{ rootElement }}>
          {children}
        </ShadowRootContext.Provider>
      )}
    </div>
  );
};
