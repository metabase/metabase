import type { JSX, ReactNode } from "react";

import type { IconName as InternalIconName } from "metabase/ui";

export type { ButtonProps } from "metabase/ui";
export type {
  ChartColor,
  MetabaseTheme,
  MetabaseColors,
  MetabaseComponentTheme,
} from "metabase/embedding-sdk/theme";
export type { MetabaseFontFamily } from "metabase/embedding-sdk/theme/fonts";

/**
 * Inline wrapper to properly display the `IconName` type without referencing the `internal` type
 *
 * @hidden
 * @inline
 */
type _IconName = InternalIconName;

export type IconName = _IconName;

export type SdkErrorComponentProps = {
  message: ReactNode;
};

export type SdkErrorComponent = ({
  message,
}: SdkErrorComponentProps) => JSX.Element;
