import { useEffect, useRef } from "react";

import {
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import { Route, useNavigate, useSearchParams } from "metabase/router";
import { Loader } from "metabase/ui";

function MetabotNewRoute() {
  const [searchParams] = useSearchParams();
  const { canUseMetabot, isLoading } = useUserMetabotPermissions();
  const { submitInput } = useMetabotAgent("omnibot");
  const prompt = searchParams.get("q") ?? "";
  const navigate = useNavigate();
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    if (isLoading || hasRedirectedRef.current) {
      return;
    }

    hasRedirectedRef.current = true;
    navigate("/", { replace: true });

    if (prompt && canUseMetabot) {
      void submitInput(prompt, { focusInput: true });
    }
  }, [isLoading, canUseMetabot, prompt, submitInput, navigate]);

  return <Loader m="5rem auto" display="block" size="xl" />;
}

export const getMetabotQuickLinks = () => {
  return (
    <Route key="metabot" path="metabot/new" element={<MetabotNewRoute />} />
  );
};
