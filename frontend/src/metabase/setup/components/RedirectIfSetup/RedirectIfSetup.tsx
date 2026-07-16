import type { ReactNode } from "react";
import { useState } from "react";

import { useSelector } from "metabase/redux";
import { Navigate } from "metabase/router";
import { getSetting } from "metabase/selectors/settings";

/**
 * Sends users away from `/setup` once the instance has been set up.
 *
 * Only the value on entry decides: finishing the wizard's user step calls
 * `/api/setup` and reloads settings, flipping `has-user-setup` to true midway
 * through the flow. Reading it live would redirect the user out of setup.
 */
export function RedirectIfSetup({ children }: { children: ReactNode }) {
  const hasUserSetup = useSelector((state) =>
    getSetting(state, "has-user-setup"),
  );
  const [hadUserSetupOnEnter] = useState(hasUserSetup);

  return hadUserSetupOnEnter ? <Navigate to="/" replace /> : <>{children}</>;
}
