import { t } from "ttag";

import { useUpdateCardMutation } from "metabase/api";
import { EditableText } from "metabase/common/components/EditableText";
import { Markdown } from "metabase/common/components/Markdown";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box } from "metabase/ui";
import type { Card, CardType } from "metabase-types/api";

type DescriptionSectionProps = {
  card: Card;
};

export function DescriptionSection({ card }: DescriptionSectionProps) {
  const [updateCard] = useUpdateCardMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const handleChange = async (newValue: string) => {
    const newDescription = newValue.trim();
    const { error } = await updateCard({
      id: card.id,
      description: newDescription.length > 0 ? newDescription : null,
    });
    if (error) {
      sendErrorToast(getErrorMessage(card.type));
    } else {
      sendSuccessToast(getSuccessMessage(card.type));
    }
  };

  if (card.can_write) {
    return (
      <Box>
        <EditableText
          initialValue={card.description ?? ""}
          placeholder={t`No description`}
          isMarkdown
          onChange={handleChange}
          px={0}
        />
      </Box>
    );
  }

  if (card.description) {
    return <Markdown>{card.description}</Markdown>;
  }

  return <Box c="text-secondary" lh="h4">{t`No description`}</Box>;
}

function getSuccessMessage(cardType: CardType) {
  switch (cardType) {
    case "question":
      return t`Question description updated`;
    case "model":
      return t`Model description updated`;
    case "metric":
      return t`Metric description updated`;
  }
}

function getErrorMessage(cardType: CardType) {
  switch (cardType) {
    case "question":
      return t`Failed to update question description`;
    case "model":
      return t`Failed to update model description`;
    case "metric":
      return t`Failed to update metric description`;
  }
}
