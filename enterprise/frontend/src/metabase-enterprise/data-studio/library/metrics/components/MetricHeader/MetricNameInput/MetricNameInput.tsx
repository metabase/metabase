import { t } from "ttag";

import { useUpdateCardMutation } from "metabase/api";
import { PaneHeaderInput } from "metabase/data-studio/common/components/PaneHeader";
import { useMetadataToasts } from "metabase/metadata/hooks";
import type { Card } from "metabase-types/api";

import { NAME_MAX_LENGTH } from "../../../constants";

type MetricNameInputProps = {
  card: Card;
  onChangeName?: (name: string) => void;
};

export function MetricNameInput({ card }: MetricNameInputProps) {
  const [updateCard] = useUpdateCardMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const handleChangeName = async (newName: string) => {
    const { error } = await updateCard({
      id: card.id,
      name: newName,
    });

    if (error) {
      sendErrorToast(t`Failed to update metric name`);
    } else {
      sendSuccessToast(t`Metric name updated`);
    }
  };

  return (
    <PaneHeaderInput
      initialValue={card.name}
      maxLength={NAME_MAX_LENGTH}
      onChange={handleChangeName}
    />
  );
}
