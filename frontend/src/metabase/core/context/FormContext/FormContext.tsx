import { createContext } from "react";

export type FormStatus = "idle" | "pending" | "fulfilled" | "rejected";

export interface FormState {
  status: FormStatus;
  message?: string;
}

const FormContext = createContext<FormState>({
  status: "idle",
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormContext;
