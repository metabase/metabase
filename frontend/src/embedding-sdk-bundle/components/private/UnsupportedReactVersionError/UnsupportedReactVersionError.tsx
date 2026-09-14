import { useEffect } from "react";

import {
  getUnsupportedReactVersionMessage,
  logUnsupportedReactVersionOnce,
} from "embedding-sdk-bundle/lib/host-react-version";
import { colors } from "metabase/ui/colors/colors";

// Rendered in place of the SDK when the host React is too old for it, so it
// must stay plain React and DOM: nothing here may need the newer React.
export function UnsupportedReactVersionError() {
  useEffect(() => {
    logUnsupportedReactVersionOnce();
  }, []);

  return (
    <div
      role="alert"
      data-testid="sdk-unsupported-react-version-error"
      style={{
        display: "flex",
        alignItems: "center",
        padding: "1.25rem 1rem",
        background: colors["background_surface-error-subtle"],
        color: colors["text-secondary"],
        border: `0.5px solid ${colors["feedback-negative-strong"]}`,
        borderRadius: "12px",
        textAlign: "center",
        lineHeight: "1.4rem",
      }}
    >
      {getUnsupportedReactVersionMessage()}
    </div>
  );
}
