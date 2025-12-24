import { msgid, ngettext, t } from "ttag";

import { useUpdateCardMutation } from "metabase/api";
import { getTrashUndoMessage } from "metabase/archive/utils";
import { ArchiveModal } from "metabase/common/components/ArchiveModal";
import { useToast } from "metabase/common/hooks";
import type { Card } from "metabase-types/api";

type ArchiveCardModalProps = {
  card: Card;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onClose: () => void;
};

export function ArchiveCardModal({
  card,
  onArchive,
  onUnarchive,
  onClose,
}: ArchiveCardModalProps) {
  const { title, message } = getLabels(card);
  const additionalWarning = getWarningMessage(card);
  const [updateCard] = useUpdateCardMutation();
  const [sendToast] = useToast();

  const handleArchive = async () => {
    const action = updateCard({
      id: card.id,
      archived: true,
    });
    await action.unwrap();

    sendToast({
      message: getTrashUndoMessage(card.name, true),
      icon: "check",
      action: async () => {
        const action = updateCard({
          id: card.id,
          archived: false,
        });
        await action.unwrap();
        sendToast({
          message: getTrashUndoMessage(card.name, false),
          icon: "check",
        });
        onUnarchive?.();
      },
    });

    onArchive?.();
    onClose();
  };

  return (
    <ArchiveModal
      title={title}
      model={getModel(card)}
      modelId={card.id}
      message={`${message}${additionalWarning}`}
      onArchive={handleArchive}
      onClose={onClose}
    />
  );
}

function getLabels(card: Card) {
  const type = card.type;

  if (type === "question") {
    const message =
      card.dashboard_id != null
        ? t`This question will be removed from its dashboard and any alerts using it.`
        : t`This question will be removed from any dashboards or alerts using it.`;

    return {
      title: t`Move this question to trash?`,
      message,
    };
  }

  if (type === "model") {
    return {
      title: t`Move this model to trash?`,
      message: t`This model will be removed from any dashboards or alerts using it.`,
    };
  }

  if (type === "metric") {
    return {
      title: t`Archive this metric?`,
      message: t`This metric will be removed from any dashboards or pulses using it.`,
    };
  }

  throw new Error(`Unknown question.type(): ${type}`);
}

function getWarningMessage(card: Card) {
  const widgetCount = card.parameter_usage_count;
  if (widgetCount == null || widgetCount === 0) {
    return "";
  }

  return (
    " " +
    ngettext(
      msgid`It will also be removed from the filter that uses it to populate values.`,
      `It will also be removed from the ${widgetCount} filters that use it to populate values.`,
      widgetCount,
    )
  );
}

function getModel(card: Card) {
  switch (card.type) {
    case "question":
      return "card";
    default:
      return card.type;
  }
}
