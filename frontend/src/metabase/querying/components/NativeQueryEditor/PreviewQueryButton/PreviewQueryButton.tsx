import { type JSX, useCallback } from "react";
import { t } from "ttag";

import {
  getVariableTemplateTags,
  hasSnippetTemplateTags,
} from "metabase/querying/native";
import type { QueryModalType } from "metabase/redux/store";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { MODAL_TYPES } from "../../../constants";

interface PreviewQueryButtonProps {
  onOpenModal?: (modalType: QueryModalType) => void;
}

export const PreviewQueryButton = ({
  onOpenModal,
}: PreviewQueryButtonProps): JSX.Element => {
  const handleClick = useCallback(() => {
    onOpenModal?.(MODAL_TYPES.PREVIEW_QUERY);
  }, [onOpenModal]);

  return (
    <Tooltip label={t`Preview the query`}>
      <ActionIcon
        variant="subtle"
        aria-label={t`Preview the query`}
        onClick={handleClick}
      >
        <Icon name="eye_filled" />
      </ActionIcon>
    </Tooltip>
  );
};

interface PreviewQueryButtonOpts {
  question: Question;
}

PreviewQueryButton.shouldRender = ({ question }: PreviewQueryButtonOpts) => {
  const query = question.query();
  const { isNative } = Lib.queryDisplayInfo(query);

  if (!isNative) {
    return false;
  }

  const hasVariableTemplateTags = getVariableTemplateTags(query).length > 0;
  const hasSnippets = hasSnippetTemplateTags(query);

  return question.canRun() && (hasVariableTemplateTags || hasSnippets);
};
