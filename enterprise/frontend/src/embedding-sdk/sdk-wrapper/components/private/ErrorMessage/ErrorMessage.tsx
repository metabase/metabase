import { SDK_BUNDLE_LOADING_ERROR_MESSAGE } from "embedding-sdk/sdk-wrapper/config";
import { colors } from "metabase/lib/colors/colors";

export const ErrorMessage = () => (
  <div style={{ padding: "0.5rem" }}>
    <div
      style={{
        padding: "1rem",
        background: colors["bg-error"],
        color: colors["text-dark"],
        border: `1px solid ${colors.error}`,
        borderRadius: "4px",
        fontWeight: "bold",
        textAlign: "center",
      }}
    >
      {SDK_BUNDLE_LOADING_ERROR_MESSAGE}
    </div>
  </div>
);
