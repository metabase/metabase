import { useFormikContext } from "formik";

export type FormStatus = "pending" | "fulfilled" | "rejected";

export interface FormState {
  status?: FormStatus;
  message?: string;
}

export function useFormState(): FormState {
  const { status } = useFormikContext();
  return status ?? {};
}
