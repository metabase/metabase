import { createContext } from "react";

export type FormStatus = "idle" | "pending" | "fulfilled" | "rejected";

export interface FormState {
  status: FormStatus;
  message?: string;
}

export interface IFormContext extends FormState {
  setStatus: (status: FormStatus) => void;
}

export const FormContext = createContext<IFormContext>({
  status: "idle",
  setStatus: () => {},
});
