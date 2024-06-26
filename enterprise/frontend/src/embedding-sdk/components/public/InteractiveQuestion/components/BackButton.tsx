import { t } from "ttag";

import { useInteractiveQuestionContext } from "embedding-sdk/components/public/InteractiveQuestion/context/context";
import { Button, Icon, Tooltip } from "metabase/ui";

const sizeOverrideStyles = {
  width: 32,
  height: 32,
};

export const QuestionBackButton = () => {
  const { onNavigateBack } = useInteractiveQuestionContext();
  return (
    onNavigateBack && (
      <Tooltip label={t`Reset view`}>
        <Button
          variant="outline"
          radius="xl"
          size="xs"
          leftIcon={<Icon name="arrow_left" />}
          style={sizeOverrideStyles}
          onClick={onNavigateBack}
        />
      </Tooltip>
    )
  );
};
