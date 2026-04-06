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

export interface MfaLoginResponse {
  mfa_required: true;
  mfa_token: string;
}

export interface MfaVerifyData {
  "mfa-token": string;
  "totp-code"?: string;
  "recovery-code"?: string;
}

export interface LoginResult {
  mfaRequired: boolean;
  mfaToken?: string;
}
