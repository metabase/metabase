import { t } from "ttag";

import type {
  ActionDisplayType,
  DashboardId,
  DashboardTabId,
  WritebackAction,
} from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import { trackCardCreated } from "../analytics";
import { createVirtualCard } from "../utils";

import { addDashCardToDashboard } from "./cards-typed";

type AddActionToDashboardOpts = {
  dashId: DashboardId;
  tabId: DashboardTabId | null;
  action: Partial<WritebackAction>;
  displayType?: ActionDisplayType;
};

export const addActionToDashboard =
  ({ dashId, tabId, action, displayType }: AddActionToDashboardOpts) =>
  (dispatch: Dispatch) => {
    trackCardCreated("action", dashId);

    const modelId = action.model_id ?? null;
    const virtualActionsCard = createVirtualCard("action");

    const buttonLabel =
      action.name ?? (action.id != null ? String(action.id) : t`Click Me`);

    const dashcardOverrides = {
      action: action.id ? action : null,
      action_id: action.id,
      card_id: modelId,
      card: virtualActionsCard,
      visualization_settings: {
        actionDisplayType: displayType ?? "button",
        virtual_card: virtualActionsCard,
        "button.label": buttonLabel,
      },
    };

    dispatch(
      addDashCardToDashboard({
        dashId: dashId,
        dashcardOverrides: dashcardOverrides,
        tabId,
      }),
    );
  };
