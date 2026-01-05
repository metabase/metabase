import type { JSX, ReactNode } from "react";

/**
 * @inline
 */
export type InitializationStatusUninitialized = {
  status: "uninitialized";
};

/**
 * @inline
 */
export type InitializationStatusSuccess = {
  status: "success";
};

/**
 * @inline
 */
export type InitializationStatusLoading = {
  status: "loading";
};

/**
 * @inline
 */
export type InitializationStatusError = {
  status: "error";
  error: Error;
};

export type InitializationStatus =
  | InitializationStatusUninitialized
  | InitializationStatusSuccess
  | InitializationStatusLoading
  | InitializationStatusError;

export type { ButtonProps } from "metabase/ui";
export type {
  ChartColor,
  MetabaseTheme,
  MetabaseThemePreset,
  MetabaseColors,
  MetabaseComponentTheme,
} from "metabase/embedding-sdk/theme";
export type { MetabaseFontFamily } from "metabase/embedding-sdk/theme/fonts";

export type SdkErrorComponentProps = {
  type?: "relative" | "fixed";
  message: ReactNode;
  error?: Error;
  withCloseButton?: boolean;
  onClose?: () => void;
};

export type SdkErrorComponent = ({
  type,
  message,
  error,
}: SdkErrorComponentProps) => JSX.Element;

export type SdkLoadingError = {
  status: number;
  message: string;
};
