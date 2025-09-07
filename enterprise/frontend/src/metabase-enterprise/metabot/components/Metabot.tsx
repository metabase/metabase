import { useEffect } from "react";
import { tinykeys } from "tinykeys";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useSelector } from "metabase/lib/redux";
import { getLocation } from "metabase/selectors/routing";
import { getUser } from "metabase/selectors/user";

import { useMetabotAgent } from "../hooks";

import { MetabotChat } from "./MetabotChat";

export interface MetabotProps {
  hide?: boolean;
}

export const MetabotAuthenticated = ({ hide }: MetabotProps) => {
  const { visible, setVisible } = useMetabotAgent();
  const location = useSelector(getLocation);

  const isOnTransformsPage =
    location?.pathname?.startsWith("/admin/transforms");
  const shouldHide = hide || isOnTransformsPage;

  useEffect(() => {
    return tinykeys(window, {
      "$mod+b": (e) => {
        e.preventDefault(); // prevent FF from opening bookmark menu
        setVisible(!visible);
      },
    });
  }, [visible, setVisible]);

  useEffect(
    function closeViaPropChange() {
      if (shouldHide) {
        setVisible(false);
      }
    },
    [shouldHide, setVisible],
  );

  if (!visible || shouldHide) {
    return null;
  }

  return (
    <ErrorBoundary errorComponent={() => null}>
      <MetabotChat />
    </ErrorBoundary>
  );
};

export const Metabot = (props: MetabotProps) => {
  const currentUser = useSelector(getUser);

  // NOTE: do not render Metabot if the user is not authenticated.
  // doing so will cause a redirect for unauthenticated requests
  // which will break interactive embedding. See (metabase#58687).
  if (!currentUser) {
    return null;
  }

  return <MetabotAuthenticated {...props} />;
};
