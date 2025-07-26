import { SDK_BUNDLE_LOADING_ERROR_MESSAGE } from "embedding-sdk/sdk-wrapper/config";
import { colors } from "metabase/lib/colors/colors";

// Mimics the frontend/src/metabase/common/components/Alert/Alert.styled.tsx
export const ErrorMessage = () => (
  <div style={{ padding: "0.5rem" }} data-testid="sdk-error-container">
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
      {SDK_BUNDLE_LOADING_ERROR_MESSAGE}
    </div>
  </div>
);
