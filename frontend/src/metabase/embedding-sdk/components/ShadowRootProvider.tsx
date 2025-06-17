import {
  type Context,
  type PropsWithChildren,
  createContext,
  useState,
} from "react";

export const ShadowRootContext = createContext({}) as unknown as Context<{
  rootElement: HTMLDivElement | null;
}>;

export const ShadowRootProvider = ({ children }: PropsWithChildren) => {
  const [rootElement, setRootElement] = useState<HTMLDivElement | null>(null);

  return (
    <ShadowRootContext.Provider value={{ rootElement }}>
      <div
        ref={(el) => {
          if (el) {
            window["mb_root_element"] = el;
            setRootElement(el);
          }
        }}
      >
        {children}
      </div>
    </ShadowRootContext.Provider>
  );
};
