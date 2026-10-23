export interface PasswordResetTokenStatus {
  valid: boolean;
}

export interface LoginData {
  username: string;
  password: string;
  remember?: boolean;
}
