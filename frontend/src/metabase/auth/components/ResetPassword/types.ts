export type PasswordViewType = "none" | "form" | "success" | "expired";

export interface PasswordData {
  password: string;
  password_confirm: string;
}
