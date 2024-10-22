import { useState } from "react";

import ErrorBoundary from "metabase/ErrorBoundary";

import { MetabotChat } from "./MetabotChat";
import { MetabotStartChatButton } from "./MetabotStartChatButton";

export const Metabot = () => {
  const [expanded, setExpanded] = useState(false);

  return (
    <ErrorBoundary errorComponent={() => null}>
      {expanded ? (
        <MetabotChat onClose={() => setExpanded(false)} />
      ) : (
        <MetabotStartChatButton onClick={() => setExpanded(true)} />
      )}
    </ErrorBoundary>
  );
};
