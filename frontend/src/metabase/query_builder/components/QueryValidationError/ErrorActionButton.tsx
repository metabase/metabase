import { t } from "ttag";
import { connect } from "react-redux";

import { getUiControls } from "metabase/query_builder/selectors";
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
};

const mapStateToProps = (state: any) => ({
  uiControls: getUiControls(state),
});

export const BUTTON_ACTIONS: Record<
  ErrorType,
  [string, (props: ErrorActionButtonProps) => void]
> = {
  [VALIDATION_ERROR_TYPES.MISSING_TAG_DIMENSION]: [
    t`Edit variables`,
    () => {
      // TODO: This function originally just triggered trackStructEvent,
      // which has been removed. Can BUTTON_ACTIONS now be removed?
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
export default connect(mapStateToProps)(ErrorActionButton);
