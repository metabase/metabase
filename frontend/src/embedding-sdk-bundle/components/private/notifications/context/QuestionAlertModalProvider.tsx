import { useDisclosure } from "@mantine/hooks";
import { type PropsWithChildren, createContext, useContext } from "react";

interface QuestionAlertModalContext {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
}

const DEFAULT_CONTEXT_VALUE: QuestionAlertModalContext = {
  isOpen: false,
  toggle: () => {},
  close: () => {},
};

const questionAlertModalContext = createContext<QuestionAlertModalContext>(
  DEFAULT_CONTEXT_VALUE,
);

export function QuestionAlertModalProvider({
  children,
}: PropsWithChildren): JSX.Element {
  const [isOpen, { close, toggle }] = useDisclosure(false);
  return (
    <questionAlertModalContext.Provider value={{ isOpen, toggle, close }}>
      {children}
    </questionAlertModalContext.Provider>
  );
}

export function useQuestionAlertModalContext() {
  return useContext(questionAlertModalContext);
}
