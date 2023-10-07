import type { DashCardId } from "metabase-types/api";
import { useDashCardTabMenu } from "./use-dash-card-tab-menu";

interface DashCardTabMenuProps {
  dashCardId: DashCardId;
}

export function DashCardTabMenu({ dashCardId }: DashCardTabMenuProps) {
  const { showMenu, tabs, moveToTab } = useDashCardTabMenu(dashCardId);

  if (!showMenu) {
    return null;
  }

  // TODO menu html + styles
  return <a onClick={() => moveToTab(tabs[1].id)}>Move to {tabs[1].name}</a>;
}
