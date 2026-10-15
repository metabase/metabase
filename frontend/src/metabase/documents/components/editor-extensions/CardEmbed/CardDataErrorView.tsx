import { t } from "ttag";

import type { CardDataError } from "metabase/rich_text_editing/tiptap/EditorHost";
import { ErrorView } from "metabase/visualizations/components/Visualization/ErrorView/ErrorView";
import { getPermissionErrorMessage } from "metabase/viz-core";
import type { IconName } from "metabase-types/api";

type CardDataErrorDisplay = {
  message: string;
  icon?: IconName;
};

const CARD_DATA_ERRORS: Record<CardDataError, () => CardDataErrorDisplay> = {
  "not found": () => ({ message: t`Couldn't find this chart.` }),
  forbidden: () => ({ message: getPermissionErrorMessage(), icon: "key" }),
  unknown: () => ({ message: t`Failed to load question.` }),
};

type CardDataErrorViewProps = {
  error: CardDataError;
};

export function CardDataErrorView({ error }: CardDataErrorViewProps) {
  const { message, icon } = CARD_DATA_ERRORS[error]();
  return <ErrorView error={message} icon={icon} />;
}
