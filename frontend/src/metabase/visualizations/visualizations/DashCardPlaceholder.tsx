import { useState } from "react";
import { t } from "ttag";
import { Flex, Button } from "metabase/ui";
import { useDispatch } from "metabase/lib/redux";
import { replaceCard } from "metabase/dashboard/actions";
import { QuestionPickerModal } from "metabase/dashboard/components/QuestionPickerModal";
import type { CardId, DashboardCard } from "metabase-types/api";
import type { VisualizationProps } from "../types";

function preventDragging(e: React.MouseEvent<HTMLButtonElement>) {
  e.stopPropagation();
}

type Props = VisualizationProps & {
  dashcard: DashboardCard;
};

function DashCardPlaceholderInner({ dashcard, isDashboard, isEditing }: Props) {
  const dispatch = useDispatch();

  const [isOpen, setIsOpen] = useState(false);

  const handleSelectQuestion = (nextCardId: CardId) => {
    dispatch(replaceCard({ dashcardId: dashcard.id, nextCardId }));
  };

  if (!isDashboard) {
    return null;
  }

  return (
    <>
      <Flex align="center" justify="center" p={2} style={{ flex: 1 }}>
        {isEditing && (
          <Button
            onClick={() => setIsOpen(true)}
            onMouseDown={preventDragging}
            style={{ pointerEvents: "all" }}
          >{t`Select question`}</Button>
        )}
      </Flex>
      <QuestionPickerModal
        opened={isOpen}
        onSelect={handleSelectQuestion}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}

DashCardPlaceholderInner.displayName = "DashCardPlaceholder";

export const DashCardPlaceholder = Object.assign(DashCardPlaceholderInner, {
  uiName: t`Placeholder`,
  identifier: "placeholder",
  iconName: "table_spaced",

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
