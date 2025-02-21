import { useCallback } from "react";
import { t } from "ttag";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import Tooltip from "metabase/core/components/Tooltip";
import type { QueryModalType } from "metabase/query_builder/constants";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import { Icon } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";

import PreviewQueryButtonS from "./PreviewQueryButton.module.css";

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
    <Tooltip tooltip={t`Preview the query`}>
      <IconButtonWrapper
        className={PreviewQueryButtonS.PreviewButton}
        aria-label={t`Preview the query`}
        onClick={handleClick}
      >
        <Icon
          className={PreviewQueryButtonS.PreviewButtonIcon}
          name="eye_filled"
        />
      </IconButtonWrapper>
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
