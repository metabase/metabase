export type {
  SdkErrorComponent,
  SdkErrorComponentProps,
} from "metabase/embedding-sdk/types/error-component";

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
export type { MetabaseFontFamily } from "metabase/utils/fonts";
export type {
  ChartColor,
  MetabaseTheme,
  MetabaseThemePreset,
  MetabaseColors,
  MetabaseComponentTheme,
} from "metabase/embedding-sdk/theme";

export type SdkLoadingError = {
  status: number;
  message: string;
};
