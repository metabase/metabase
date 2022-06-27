import React from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import ValidationError, {
  VALIDATION_ERROR_TYPES,
  ErrorType,
} from "metabase-lib/lib/ValidationError";
import { getUiControls } from "metabase/query_builder/selectors";
import { toggleTemplateTagsEditor } from "metabase/query_builder/actions";

import { QueryValidationErrorProps } from "./QueryValidationError";
import { QueryErrorActionButton } from "./QueryValidationError.styled";

type QueryBuilderUiControls = {
  isShowingTemplateTagsEditor?: boolean;
};

export type ErrorActionButtonProps = QueryValidationErrorProps & {
  uiControls: QueryBuilderUiControls;
  toggleTemplateTagsEditor: () => void;
};

const mapStateToProps = (state: any, props: QueryValidationErrorProps) => ({
  uiControls: getUiControls(state),
});

const mapDispatchToProps = {
  toggleTemplateTagsEditor,
};

export const BUTTON_ACTIONS: Record<
  ErrorType,
  [string, (props: ErrorActionButtonProps) => void]
> = {
  [VALIDATION_ERROR_TYPES.MISSING_TAG_DIMENSION]: [
    t`Edit variables`,
    ({ uiControls, toggleTemplateTagsEditor }) => {
      if (!uiControls.isShowingTemplateTagsEditor) {
        toggleTemplateTagsEditor();
      }
    },
  ],
};

export function ErrorActionButton(props: ErrorActionButtonProps) {
  const { error } = props;
  const type = error instanceof ValidationError ? error.type : undefined;

  if (!type || !BUTTON_ACTIONS[type]) {
    return null;
  }

  const [buttonLabel, actionFn] = BUTTON_ACTIONS[type];

  return (
    <QueryErrorActionButton onClick={() => actionFn(props)}>
      {buttonLabel}
    </QueryErrorActionButton>
  );
}

export default connect(mapStateToProps, mapDispatchToProps)(ErrorActionButton);
