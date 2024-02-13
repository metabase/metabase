import { t } from "ttag";
import { connect } from "react-redux";

import { getUiControls } from "metabase/query_builder/selectors";
import { toggleTemplateTagsEditor } from "metabase/query_builder/actions";
import type { ErrorType } from "metabase-lib/ValidationError";
import ValidationError, {
  VALIDATION_ERROR_TYPES,
} from "metabase-lib/ValidationError";

import type { QueryValidationErrorProps } from "./QueryValidationError";
import { QueryErrorActionButton } from "./QueryValidationError.styled";

type QueryBuilderUiControls = {
  isShowingTemplateTagsEditor?: boolean;
};

export type ErrorActionButtonProps = QueryValidationErrorProps & {
  uiControls: QueryBuilderUiControls;
  toggleTemplateTagsEditor: () => void;
};

const mapStateToProps = (state: any) => ({
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(ErrorActionButton);
