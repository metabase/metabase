import type { JSX, ReactNode } from "react";

export type { ButtonProps } from "metabase/ui";
export type {
  ChartColor,
  MetabaseTheme,
  MetabaseColors,
  MetabaseComponentTheme,
} from "metabase/embedding-sdk/theme";
export type { MetabaseFontFamily } from "metabase/embedding-sdk/theme/fonts";

export type SdkErrorComponentProps = {
  message: ReactNode;
};

export type SdkErrorComponent = ({
  message,
}: SdkErrorComponentProps) => JSX.Element;
