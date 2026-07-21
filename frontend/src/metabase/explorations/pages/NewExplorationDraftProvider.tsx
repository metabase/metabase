import type { Location } from "history";
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import { useMetabotAgent } from "metabase/metabot/hooks";
import { Outlet } from "metabase/router";
import * as Urls from "metabase/urls";

import { EXPLORATIONS_AGENT_ID } from "../components/NewExplorationChat/NewExplorationChat";
import { type ExplorationSelection, useExplorationSelection } from "../hooks";

const NewExplorationDraftContext = createContext<ExplorationSelection | null>(
  null,
);

export function useNewExplorationDraft(): ExplorationSelection {
  const selection = useContext(NewExplorationDraftContext);
  if (!selection) {
    throw new Error(
      "useNewExplorationDraft must be used under the research route",
    );
  }
  return selection;
}

/**
 * Mounted on the parent `research` route, so one draft (selection +
 * conversation) spans the entry and plan pages and survives the navigation
 * between them, including browser back/forward. A fresh push to the entry URL
 * (+ New menu, "All projects") starts a new draft.
 */
export function NewExplorationDraftProvider(props: {
  location?: Location;
  // Rendered as an `element` route, so children come from <Outlet/>; the prop
  // stays for the unit test, which passes the pages in directly.
  children?: ReactNode;
}) {
  const { location, children = <Outlet /> } = props;

  const [freshKey, setFreshKey] = useState(location?.key);

  // Effect rather than render-time derivation: the draft keeps rendering for
  // one extra frame before the remount, which is invisible here.
  useEffect(() => {
    if (
      location?.pathname === Urls.newExploration() &&
      location?.action !== "POP"
    ) {
      setFreshKey(location?.key);
    }
  }, [location]);

  return <NewExplorationDraft key={freshKey}>{children}</NewExplorationDraft>;
}

function NewExplorationDraft({ children }: { children?: ReactNode }) {
  const selection = useExplorationSelection();

  const { createNewConversation } = useMetabotAgent(EXPLORATIONS_AGENT_ID);

  useEffect(() => {
    createNewConversation();
  }, [createNewConversation]);

  return (
    <NewExplorationDraftContext.Provider value={selection}>
      {children}
    </NewExplorationDraftContext.Provider>
  );
}
