import { createContext } from "react";

export type FormStatus = "idle" | "pending" | "fulfilled" | "rejected";

export interface FormState {
  status: FormStatus;
  message?: string;
  isDirty?: boolean;
}

const FormContext = createContext<FormState>({
  status: "idle",
  isDirty: false,
});

export default FormContext;
