import { createContext, Dispatch, SetStateAction } from "react";

export type FormStatus = "idle" | "pending" | "fulfilled" | "rejected";

export interface FormState {
  status: FormStatus;
  message?: string;
}

export interface FormContextType {
  state: FormState;
  setState: Dispatch<SetStateAction<FormState>>;
}

const FormContext = createContext<FormContextType>({
  state: { status: "idle" },
  setState: () => undefined,
});

export default FormContext;
