import type { DashCardMenuItem } from "metabase/dashboard/components/DashCard/DashCardMenu/dashcard-menu";
import type Question from "metabase-lib/v1/Question";
import type { DashCardId } from "metabase-types/api";
import type { Dispatch as ReduxDispatch } from "metabase-types/store";

type DashCardMenuItemGetter = (
  question: Question,
  dashcardId: DashCardId | undefined,
  dispatch: ReduxDispatch,
) => (DashCardMenuItem & { key: string }) | null;

export type PluginDashcardMenu = {
  dashcardMenuItemGetters: DashCardMenuItemGetter[];
};

export const PLUGIN_DASHCARD_MENU: PluginDashcardMenu = {
  dashcardMenuItemGetters: [],
};
