import { useState } from "react";
import { t } from "ttag";

import { replaceCard } from "metabase/dashboard/actions";
import { QuestionPickerModal } from "metabase/dashboard/components/QuestionPickerModal";
import { useDispatch } from "metabase/lib/redux";
import { Flex, Button } from "metabase/ui";
import type { CardId, VirtualDashboardCard } from "metabase-types/api";

import type { VisualizationProps } from "../types";

type Props = VisualizationProps & {
  dashcard: VirtualDashboardCard;
  isEditingParameter?: boolean;
};

function DashCardPlaceholderInner({
  dashcard,
  isDashboard,
  isEditing,
  isEditingParameter,
}: Props) {
  const [isQuestionPickerOpen, setQuestionPickerOpen] = useState(false);
  const dispatch = useDispatch();

  const handleSelectQuestion = (nextCardId: CardId) => {
    dispatch(replaceCard({ dashcardId: dashcard.id, nextCardId }));
  };

  if (!isDashboard) {
    return null;
  }

  const pointerEvents = isEditingParameter ? "none" : "all";

  return (
    <>
      <Flex
        align="center"
        justify="center"
        p={2}
        style={{ flex: 1, pointerEvents }}
        opacity={isEditingParameter ? 0.25 : 1}
      >
        {isEditing && (
          <Button
            onClick={() => setQuestionPickerOpen(true)}
            onMouseDown={preventDragging}
            style={{ pointerEvents }}
          >{t`Select question`}</Button>
        )}
      </Flex>
      <QuestionPickerModal
        opened={isQuestionPickerOpen}
        onSelect={handleSelectQuestion}
        onClose={() => setQuestionPickerOpen(false)}
      />
    </>
  );
}

DashCardPlaceholderInner.displayName = "DashCardPlaceholder";

function preventDragging(e: React.MouseEvent<HTMLButtonElement>) {
  e.stopPropagation();
}

export const DashCardPlaceholder = Object.assign(DashCardPlaceholderInner, {
  uiName: t`Empty card`,
  identifier: "placeholder",
  iconName: "table_spaced", // TODO replace

  canSavePng: false,
  noHeader: true,
  hidden: true,
  disableSettingsConfig: true,
  supportPreviewing: false,
  supportsSeries: false,

  checkRenderable: () => {
    // always renderable
  },
});
