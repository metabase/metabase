import { useMetabaseProviderPropsStore } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
// eslint-disable-next-line metabase/no-external-references-for-sdk-package-code
import { colors } from "metabase/ui/colors/colors";

type Props = {
  message: string;
  theme: MetabaseTheme | undefined;
};

// Mimics the error alert styling from metabase/ui
const DefaultErrorMessage = ({ message, theme }: Props) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "1.25rem 1rem",
        background:
          theme?.colors?.background ??
          colors["background_surface-error-subtle"],
        color: theme?.colors?.["text-secondary"] ?? colors["text-secondary"],
        border: `0.5px solid ${theme?.colors?.error ?? colors["feedback-negative-strong"]}`,
        borderRadius: "12px",
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
