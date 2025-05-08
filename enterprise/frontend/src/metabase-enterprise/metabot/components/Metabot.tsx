import { useCallback, useEffect } from "react";
import { tinykeys } from "tinykeys";

import ErrorBoundary from "metabase/ErrorBoundary";
import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { useSelector } from "metabase/lib/redux";

import { useMetabotAgent } from "../hooks";

import { MetabotChat } from "./MetabotChat";

export const Metabot = () => {
  const currentUser = useSelector(getCurrentUser);

  const { visible, setVisible } = useMetabotAgent();

  const onClose = useCallback(() => setVisible(false), [setVisible]);

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

  if (!visible) {
    return null;
  }

  return (
    <ErrorBoundary errorComponent={() => null}>
      <MetabotChat onClose={onClose} />
    </ErrorBoundary>
  );
};
