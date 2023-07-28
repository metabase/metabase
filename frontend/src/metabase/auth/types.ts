export interface LoginData {
  username: string;
  password: string;
  remember?: boolean;
}

export interface ForgotPasswordData {
  email: string;
}

export interface ResetPasswordData {
  password: string;
  password_confirm: string;
}
