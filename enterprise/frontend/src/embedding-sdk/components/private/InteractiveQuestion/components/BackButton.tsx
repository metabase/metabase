import { ActionIcon, Icon, Tooltip } from "metabase/ui";

import { useInteractiveQuestionContext } from "../context";

export const BackButton = () => {
  const { onNavigateBack } = useInteractiveQuestionContext();

  if (!onNavigateBack) {
    return null;
  }

  return (
    <Tooltip label="Back">
      <ActionIcon radius="xl" size="lg" onClick={onNavigateBack}>
        <Icon name="arrow_left" />
      </ActionIcon>
    </Tooltip>
  );
};
