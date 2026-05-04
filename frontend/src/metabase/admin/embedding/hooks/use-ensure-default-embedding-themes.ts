import { useEffect, useRef } from "react";

import { useSeedDefaultEmbeddingThemesMutation } from "metabase/api/embedding-theme";
import { useSetting } from "metabase/common/hooks";

import { useDefaultEmbeddingThemes } from "./use-default-embedding-themes";

/**
 * Lazily seeds the default `Light` and `Dark` embedding themes on first visit of the themes
 * listing page. Guarded by the `default-embedding-themes-seeded` setting so that subsequent
 * visits — including those after an admin has deleted the seeded themes — are no-ops.
 *
 * Safe to call unconditionally: the hook fires at most one POST per mount, and the backend
 * endpoint is itself idempotent and transactional.
 */
export function useEnsureDefaultEmbeddingThemes() {
  const alreadySeeded = useSetting("default-embedding-themes-seeded");
  const defaultThemes = useDefaultEmbeddingThemes();
  const [seedDefaultThemes] = useSeedDefaultEmbeddingThemesMutation();
  const hasAttempted = useRef(false);

  useEffect(() => {
    // Wait until the setting has resolved — `undefined` means the session has not hydrated yet.
    // Firing before that would race with the initial setting fetch and trigger a spurious POST.
    if (alreadySeeded !== false || hasAttempted.current) {
      return;
    }

    hasAttempted.current = true;
    seedDefaultThemes({ themes: defaultThemes });
  }, [alreadySeeded, defaultThemes, seedDefaultThemes]);
}
