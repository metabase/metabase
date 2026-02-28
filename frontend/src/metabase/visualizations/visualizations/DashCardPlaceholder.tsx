import { useState } from "react";
import { t } from "ttag";

import type { OmniPickerItem } from "metabase/common/components/Pickers";
import {
  QuestionPickerModal,
  isInDbTree,
} from "metabase/common/components/Pickers";
import { replaceCard } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/lib/redux";
import { Button, Flex } from "metabase/ui";
import type { Dashboard, VirtualDashboardCard } from "metabase-types/api";

import type { VisualizationProps } from "../types";

type Props = VisualizationProps & {
  dashcard: VirtualDashboardCard;
  dashboard: Dashboard;
  isEditingParameter?: boolean;
};

function DashCardPlaceholderInner({
  dashboard,
  dashcard,
  isDashboard,
  isEditing,
  isEditingParameter,
}: Props) {
  const [isQuestionPickerOpen, setQuestionPickerOpen] = useState(false);
  const dispatch = useDispatch();

  const handleSelectQuestion = (nextCard: OmniPickerItem) => {
    if (typeof nextCard.id === "number") {
      dispatch(
        replaceCard({ dashcardId: dashcard.id, nextCardId: nextCard.id }),
      );
      setQuestionPickerOpen(false);
    }
  };

  if (!isDashboard) {
    return null;
  }

  const pointerEvents = isEditingParameter ? "none" : "all";

  const shouldDisableItem = (item: OmniPickerItem) => {
    // don't allow adding items that are already saved in a different dashboard
    // probably only applicable to search and recents
    if (!isInDbTree(item) && item.dashboard_id) {
      if (item.dashboard_id !== dashboard.id) {
        return true;
      }
    }
    if (item.model === "dashboard" && item.id !== dashboard.id) {
      return true;
    }
    return false;
  };

  return (
    <>
      <Flex
        p={2}
        style={{ flex: 1, pointerEvents }}
        opacity={isEditingParameter ? 0.25 : 1}
      >
        {isEditing && (
          <Flex
            direction="column"
            align="center"
            justify="center"
            gap="sm"
            w="100%"
          >
            <Button
              onClick={() => setQuestionPickerOpen(true)}
              onMouseDown={preventDragging}
              style={{ pointerEvents }}
            >{t`Select question`}</Button>
          </Flex>
        )}
      </Flex>
      {isQuestionPickerOpen && (
        <QuestionPickerModal
          title={t`Pick what you want to replace this with`}
          value={
            dashboard.collection_id
              ? {
                  id: dashboard.collection_id,
                  model: "collection",
                }
              : undefined
          }
          options={{ hasConfirmButtons: false }}
          // TODO: account for restrictions on adding personal
          // questions to public dashboards
          models={["card", "dataset", "metric", "dashboard"]}
          onChange={handleSelectQuestion}
          onClose={() => setQuestionPickerOpen(false)}
          isDisabledItem={shouldDisableItem}
        />
      )}
    </>
  );
}

DashCardPlaceholderInner.displayName = "DashCardPlaceholder";

function preventDragging(e: React.MouseEvent<HTMLButtonElement>) {
  e.stopPropagation();
}

export const DashCardPlaceholder = Object.assign(DashCardPlaceholderInner, {
  getUiName: () => t`Empty card`,
  identifier: "placeholder",
  iconName: "table",

  canSavePng: false,
  noHeader: true,
  hidden: true,
  disableSettingsConfig: true,
  supportPreviewing: false,

  checkRenderable: () => {
    // always renderable
  },
});
