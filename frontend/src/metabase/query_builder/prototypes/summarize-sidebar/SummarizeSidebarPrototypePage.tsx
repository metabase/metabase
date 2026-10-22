import { SidebarPrototypePage } from "../shared/SidebarPrototypePage";

import { VARIANTS } from "./variants";

/** `/prototypes/summarize-sidebar/<variant>?source=<id>`: the summarize sidebar's layout variants. */
export function SummarizeSidebarPrototypePage() {
  return (
    <SidebarPrototypePage
      basePath="/prototypes/summarize-sidebar"
      variants={VARIANTS}
    />
  );
}
