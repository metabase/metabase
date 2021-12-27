export enum ResetPasswordView {
  none,
  form,
  success,
  expired,
}

export interface ResetPasswordData {
  password: string;
  password_confirm: string;
}
