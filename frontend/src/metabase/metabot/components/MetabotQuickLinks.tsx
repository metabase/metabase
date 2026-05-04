import { useEffect, useState } from "react";
import { Route } from "react-router";
import { replace } from "react-router-redux";

import {
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import { useDispatch } from "metabase/redux";
import { Loader } from "metabase/ui";

export const getMetabotQuickLinks = () => {
  return (
    <Route
      key="metabot"
      path="metabot/new"
      component={(props) => {
        const { canUseMetabot, isLoading } = useUserMetabotPermissions();
        const { submitInput } = useMetabotAgent("omnibot");
        const prompt = String(props.location.query?.q ?? "");
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
        }, [
          isLoading,
          canUseMetabot,
          prompt,
          submitInput,
          dispatch,
          hasSubmitted,
        ]);

        return <Loader m="5rem auto" display="block" size="xl" />;
      }}
    />
  );
};
