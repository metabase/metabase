import { useEffect } from "react";
import { tinykeys } from "tinykeys";

import ErrorBoundary from "metabase/ErrorBoundary";
import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { useSelector } from "metabase/lib/redux";

import { useMetabotAgent } from "../hooks";

import { MetabotChat } from "./MetabotChat";

interface MetabotProps {
  isAdminApp: boolean;
}

export const Metabot = ({ isAdminApp }: MetabotProps) => {
  const currentUser = useSelector(getCurrentUser);

  const { visible, setVisible } = useMetabotAgent();

  useEffect(() => {
    if (!currentUser) {
      return () => {};
    }

    return tinykeys(window, {
      "$mod+b": (e) => {
        e.preventDefault(); // prevent FF from opening bookmark menu
        setVisible(!visible);
      },
    });
  }, [visible, setVisible, currentUser]);

  useEffect(
    function autoCloseOnAdmin() {
      if (isAdminApp) {
        setVisible(false);
      }
    },
    [isAdminApp, setVisible],
  );

  if (!visible || isAdminApp) {
    return null;
  }

  return (
    <ErrorBoundary errorComponent={() => null}>
      <MetabotChat />
    </ErrorBoundary>
  );
};
