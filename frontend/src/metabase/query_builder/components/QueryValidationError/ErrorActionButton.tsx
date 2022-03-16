import React from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import {
  ValidationError,
  VALIDATION_ERROR_TYPES,
} from "metabase-lib/lib/ValidationError";
import { getUiControls } from "metabase/query_builder/selectors";
import { toggleTemplateTagsEditor } from "metabase/query_builder/actions";

import { QueryValidationErrorProps } from "./QueryValidationError";
import { QueryErrorActionButton } from "./QueryValidationError.styled";

type QueryBuilderUiControls = {
  isShowingTemplateTagsEditor?: boolean;
};

type ErrorActionButton = QueryValidationErrorProps & {
  uiControls: QueryBuilderUiControls;
  toggleTemplateTagsEditor: () => void;
};

const mapStateToProps = (state: any, props: QueryValidationErrorProps) => ({
  uiControls: getUiControls(state),
});

const mapDispatchToProps = {
  toggleTemplateTagsEditor,
};

function ErrorActionButton({
  error,
  uiControls,
  toggleTemplateTagsEditor,
}: ErrorActionButton) {
  const type = error instanceof ValidationError ? error.type : undefined;

  switch (type) {
    case VALIDATION_ERROR_TYPES.MISSING_TAG_DIMENSION:
      return (
        <QueryErrorActionButton
          onClick={() => {
            if (!uiControls.isShowingTemplateTagsEditor) {
              toggleTemplateTagsEditor();
            }
          }}
        >
          {t`Edit variables`}
        </QueryErrorActionButton>
      );
    default:
      return null;
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(ErrorActionButton);
