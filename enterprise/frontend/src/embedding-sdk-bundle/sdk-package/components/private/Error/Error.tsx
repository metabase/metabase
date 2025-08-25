import { useMetabaseProviderPropsStore } from "embedding-sdk-bundle/sdk-shared/hooks/use-metabase-provider-props-store";
// eslint-disable-next-line no-external-references-for-sdk-package-code
import { colors } from "metabase/lib/colors/colors";

type Props = {
  message: string;
};

// Mimics the frontend/src/metabase/common/components/Alert/Alert.styled.tsx
const DefaultErrorMessage = ({ message }: Props) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      padding: "1.25rem 1rem",
      background: colors["bg-error"],
      color: colors["text-dark"],
      border: `1px solid ${colors.error}`,
      borderRadius: "0.5rem",
      textAlign: "center",
      lineHeight: "1.4rem",
    }}
  >
    {message}
  </div>
);

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
        <DefaultErrorMessage message={message} />
      )}
    </div>
  );
};
