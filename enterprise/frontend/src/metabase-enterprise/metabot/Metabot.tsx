import { useState } from "react";

import { MetabotChat } from "./MetabotChat";
import { MetabotStartChatButton } from "./MetabotStartChatButton";

export const Metabot = () => {
  const [expanded, setExpanded] = useState(false);

  if (expanded) {
    return <MetabotChat onClose={() => setExpanded(false)} />;
  }

  return <MetabotStartChatButton onClick={() => setExpanded(true)} />;
};
