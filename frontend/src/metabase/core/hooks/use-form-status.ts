import { useFormikContext } from "formik";

export type FormState = "pending" | "fulfilled" | "rejected";

export interface FormStatus {
  state?: FormState;
  message?: string;
}

const useFormStatus = (): FormStatus => {
  const { status } = useFormikContext();
  return status ?? {};
};

export default useFormStatus;
