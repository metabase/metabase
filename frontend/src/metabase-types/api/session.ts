export interface PasswordResetTokenStatus {
  valid: boolean;
  password_reset_required: boolean;
}

export interface LoginData {
  username: string;
  password: string;
  remember?: boolean;
}
