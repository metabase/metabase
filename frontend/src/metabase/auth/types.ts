import { ComponentType } from "react";

export interface AuthProvider {
  name: string;
  Button: ComponentType<AuthProviderButtonProps>;
  Panel?: ComponentType<AuthProviderPanelProps>;
}

export interface AuthProviderButtonProps {
  isCard?: boolean;
  redirectUrl?: string;
}

export interface AuthProviderPanelProps {
  redirectUrl?: string;
}

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
