import { createContext } from "react";

export type FormStatus = "idle" | "pending" | "fulfilled" | "rejected";

export interface FormState {
  status: FormStatus;
  message?: string;
  /** machine-readable `error-code` from a rejected submit's API response */
  errorCode?: string;
}

export interface IFormContext extends FormState {
  setStatus: (status: FormStatus) => void;
}

export const FormContext = createContext<IFormContext>({
  status: "idle",
  setStatus: () => {},
});
