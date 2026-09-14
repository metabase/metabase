import { useEffect } from "react";

import {
  MINIMUM_SUPPORTED_REACT_MAJOR_VERSION,
  getHostReactMajorVersion,
} from "embedding-sdk-bundle/lib/host-react-version";
import { colors } from "metabase/ui/colors/colors";

let hasLoggedToConsole = false;

// Rendered in place of the SDK when the host React is too old for it, so it
// must stay plain React and DOM: nothing here may need the newer React.
export function UnsupportedReactVersionError() {
  const message =
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- shown to developers on a misconfigured host app
    `The Metabase modular embedding SDK requires React ${MINIMUM_SUPPORTED_REACT_MAJOR_VERSION} or newer, but this application is running React ${getHostReactMajorVersion()}. Upgrade your application to React ${MINIMUM_SUPPORTED_REACT_MAJOR_VERSION} to display embedded content.`;

  useEffect(() => {
    if (!hasLoggedToConsole) {
      console.error(message);
      hasLoggedToConsole = true;
    }
  }, [message]);

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
      {message}
    </div>
  );
}
