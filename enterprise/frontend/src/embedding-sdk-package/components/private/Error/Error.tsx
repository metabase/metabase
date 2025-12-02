import { useMemo } from "react";

import { useMetabaseProviderPropsStore } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import { applyThemePreset } from "embedding-sdk-shared/lib/apply-theme-preset";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";

type Props = {
  message: string;
  theme: MetabaseTheme | undefined;
};

// Mimics the frontend/src/metabase/common/components/Alert/Alert.styled.tsx
const DefaultErrorMessage = ({ message, theme }: Props) => {
  const adjustedTheme = useMemo(() => applyThemePreset(theme), [theme]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "1.25rem 1rem",
        background: adjustedTheme?.colors?.background,
        color: adjustedTheme?.colors?.["text-primary"],
        border: `1px solid ${adjustedTheme?.colors?.error}`,
        borderRadius: "0.5rem",
        textAlign: "center",
        lineHeight: "1.4rem",
      }}
    >
      {message}
    </div>
  );
};

export const Error = ({ message }: Props) => {
  const {
    state: { props: metabaseProviderProps },
  } = useMetabaseProviderPropsStore();

  const ErrorComponent = metabaseProviderProps?.errorComponent;

  return (
    <div style={{ padding: "0.5rem" }} data-testid="sdk-error-container">
      {ErrorComponent ? (
        <ErrorComponent message={message} />
      ) : (
        <DefaultErrorMessage
          message={message}
          theme={metabaseProviderProps?.theme}
        />
      )}
    </div>
  );
};
