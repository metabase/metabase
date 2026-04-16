import { useState } from "react";
import { t } from "ttag";

import type { OmniPickerItem } from "metabase/common/components/Pickers";
import {
  QuestionPickerModal,
  isInDbTree,
} from "metabase/common/components/Pickers";
import { replaceCard } from "metabase/dashboard/actions";
import { Button, Flex } from "metabase/ui";
import { useDispatch } from "metabase/utils/redux";
import type {
  VisualizationDefinition,
  VisualizationProps,
} from "metabase/visualizations/types";
import type { Dashboard, VirtualDashboardCard } from "metabase-types/api";

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
    // proably only applicable to search and recents
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
              style={{ pointerEvents }}
              onMouseDown={preventDragging}
              onPointerDown={preventDragging}
            >{t`Select question`}</Button>
          </Flex>
        )}
      </Flex>
      {isQuestionPickerOpen && (
        <div
          style={{ display: "contents" }}
          onMouseDown={preventDragging}
          onPointerDown={preventDragging}
        >
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
        </div>
      )}
    </>
  );
}

DashCardPlaceholderInner.displayName = "DashCardPlaceholder";

/**
 * Prevents React portal event bubbling from triggering grid item drags.
 *
 * React portals (used by modals) bubble synthetic events through the React
 * component tree, not the DOM tree. This means clicks inside a modal rendered
 * by this component would bubble up to DraggableCore on the grid item and
 * initiate a drag. We stop both mousedown and pointerdown because Cypress
 * (and browsers) dispatch both events, and React processes them as separate
 * synthetic event dispatches — stopPropagation on one doesn't affect the other.
 */
function preventDragging(e: React.SyntheticEvent) {
  e.stopPropagation();
}

const PlaceholderViz: VisualizationDefinition = {
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
};

export const DashCardPlaceholder = Object.assign(
  DashCardPlaceholderInner,
  PlaceholderViz,
);
