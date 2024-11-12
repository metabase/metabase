import { useCallback, useEffect } from "react";
import { tinykeys } from "tinykeys";

import ErrorBoundary from "metabase/ErrorBoundary";

import { useMetabotAgent } from "../hooks";

import { MetabotChat } from "./MetabotChat";

export const Metabot = () => {
  const { visible, setVisible } = useMetabotAgent();

  const onClose = useCallback(() => setVisible(false), [setVisible]);

  useEffect(() => {
    return tinykeys(window, {
      "$mod+b": () => setVisible(!visible),
    });
  }, [visible, setVisible]);

  if (!visible) {
    return null;
  }

  return (
    <ErrorBoundary errorComponent={() => null}>
      <MetabotChat onClose={onClose} />
    </ErrorBoundary>
  );
};
