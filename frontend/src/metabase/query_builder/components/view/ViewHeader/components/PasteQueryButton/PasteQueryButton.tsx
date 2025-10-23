import { t } from "ttag";

import { Button, Icon, Tooltip } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import ViewTitleHeaderS from "../../ViewTitleHeader.module.css";

interface PasteQueryButtonProps {
  question: Question;
  onPaste: () => void;
  queryBuilderMode?: string;
}

export const PasteQueryButton = ({ onPaste }: PasteQueryButtonProps) => {
  return (
    <Tooltip label={t`Paste query from clipboard`}>
      <Button
        className={ViewTitleHeaderS.PasteQueryButton}
        leftSection={<Icon name="clipboard" />}
        onClick={onPaste}
        aria-label={t`Paste query from clipboard`}
      >
        {t`Paste`}
      </Button>
    </Tooltip>
  );
};

PasteQueryButton.shouldRender = ({
  queryBuilderMode,
}: {
  question: Question;
  queryBuilderMode?: string;
}) => {
  // Show paste button in query editor and notebook modes
  return (
    queryBuilderMode === "query" ||
    queryBuilderMode === "native" ||
    queryBuilderMode === "notebook"
  );
};
