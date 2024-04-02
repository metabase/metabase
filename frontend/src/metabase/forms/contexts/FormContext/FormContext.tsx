import { createContext } from "react";

export type FormStatus = "idle" | "pending" | "fulfilled" | "rejected";

export interface FormState {
  status: FormStatus;
  message?: string;
}

export interface FormContextType extends FormState {
  setStatus: (status: FormStatus) => void;
}

export const FormContext = createContext<FormContextType>({
  status: "idle",
  setStatus: () => {},
});
