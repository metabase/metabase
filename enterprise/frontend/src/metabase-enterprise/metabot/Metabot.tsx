import { useEffect } from "react";
import { tinykeys } from "tinykeys";

import ErrorBoundary from "metabase/ErrorBoundary";

import { MetabotChat } from "./MetabotChat";
import { useMetabotAgent } from "./hooks";

export const Metabot = () => {
  const { visible, setVisible } = useMetabotAgent();

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
      <MetabotChat onClose={() => setVisible(false)} />
    </ErrorBoundary>
  );
};
