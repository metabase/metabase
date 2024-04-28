import { useCallback } from "react";
import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";

import { PreviewButton, PreviewButtonIcon } from "./PreviewQueryButton.styled";

interface PreviewQueryButtonProps {
  onOpenModal?: (modalType: string) => void;
}

export const PreviewQueryButton = ({
  onOpenModal,
}: PreviewQueryButtonProps): JSX.Element => {
  const handleClick = useCallback(() => {
    onOpenModal?.(MODAL_TYPES.PREVIEW_QUERY);
  }, [onOpenModal]);

  return (
    <Tooltip tooltip={t`Preview the query`}>
      <PreviewButton aria-label={t`Preview the query`} onClick={handleClick}>
        <PreviewButtonIcon name="eye_filled" />
      </PreviewButton>
    </Tooltip>
  );
};

interface PreviewQueryButtonOpts {
  question: Question;
}

PreviewQueryButton.shouldRender = ({ question }: PreviewQueryButtonOpts) => {
  const { isNative } = Lib.queryDisplayInfo(question.query());

  return (
    isNative &&
    question.canRun() &&
    (question.legacyQuery() as NativeQuery).hasVariableTemplateTags()
  );
};
