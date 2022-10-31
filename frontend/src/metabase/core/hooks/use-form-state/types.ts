export type FormStatus = "pending" | "fulfilled" | "rejected";

export interface FormState {
  status?: FormStatus;
  message?: string;
}
