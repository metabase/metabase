import { useCallback } from "react";
import { t } from "ttag";
import Tooltip from "metabase/core/components/Tooltip";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import type Question from "metabase-lib/Question";
import NativeQuery from "metabase-lib/queries/NativeQuery";
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
  const query = question.legacyQuery();

  return (
    question.canRun() &&
    query instanceof NativeQuery &&
    query.hasVariableTemplateTags()
  );
};
