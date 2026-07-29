import { useEffect, useState } from "react";

import {
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import { useDispatch } from "metabase/redux";
import { Route, replace, useRouter } from "metabase/router";
import { Loader } from "metabase/ui";

function MetabotNewRoute() {
  const { location } = useRouter();
  const { canUseMetabot, isLoading } = useUserMetabotPermissions();
  const { submitInput } = useMetabotAgent("omnibot");
  const prompt = String(location.query?.q ?? "");
  const dispatch = useDispatch();
  const [hasSubmitted, setHasSubmitted] = useState(false);

  useEffect(() => {
    if (isLoading || hasSubmitted) {
      return;
    }

    dispatch(replace("/"));

    if (prompt && canUseMetabot) {
      void submitInput(prompt, { focusInput: true });
      setHasSubmitted(true);
    }
  }, [isLoading, canUseMetabot, prompt, submitInput, dispatch, hasSubmitted]);

  return <Loader m="5rem auto" display="block" size="xl" />;
}

export const getMetabotQuickLinks = () => {
  return (
    <Route key="metabot" path="metabot/new" element={<MetabotNewRoute />} />
  );
};
