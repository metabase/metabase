import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { isMac } from "metabase/lib/browser";

import DataReferenceButton from "metabase/query_builder/components/view/DataReferenceButton";
import NativeVariablesButton from "metabase/query_builder/components/view/NativeVariablesButton";
import SnippetSidebarButton from "metabase/query_builder/components/view/SnippetSidebarButton";
import PreviewQueryButton from "metabase/query_builder/components/view/PreviewQueryButton";

import {
  Container,
  RunButtonWithTooltipStyled,
} from "./NativeQueryEditorSidebar.styled";

const propTypes = {
  question: PropTypes.object,
  cancelQuery: PropTypes.func,
  isResultDirty: PropTypes.bool,
  isRunnable: PropTypes.bool,
  isRunning: PropTypes.bool,
  nativeEditorSelectedText: PropTypes.string,
  runQuery: PropTypes.func,
  snippetCollections: PropTypes.array,
  snippets: PropTypes.array,
  features: {
    dataReference: PropTypes.bool,
    variables: PropTypes.bool,
    snippets: PropTypes.bool,
  },
};

const ICON_SIZE = 18;

const NativeQueryEditorSidebar = props => {
  const {
    question,
    cancelQuery,
    isResultDirty,
    isRunnable,
    isRunning,
    nativeEditorSelectedText,
    runQuery,
    snippetCollections,
    snippets,
    features,
  } = props;

  // hide the snippet sidebar if there aren't any visible snippets/collections
  // and the root collection isn't writable
  const showSnippetSidebarButton = !(
    snippets?.length === 0 &&
    snippetCollections?.length === 1 &&
    !snippetCollections[0].can_write
  );

  const getTooltip = () => {
    const command = nativeEditorSelectedText
      ? t`Run selected text`
      : t`Run query`;

    const shortcut = isMac() ? t`(⌘ + enter)` : t`(Ctrl + enter)`;

    return command + " " + shortcut;
  };

  const canRunQuery = runQuery && cancelQuery;

  return (
    <Container>
      {features.dataReference ? (
        <DataReferenceButton {...props} size={ICON_SIZE} className="mt3" />
      ) : null}
      {features.variables ? (
        <NativeVariablesButton {...props} size={ICON_SIZE} className="mt3" />
      ) : null}
      {features.snippets && showSnippetSidebarButton ? (
        <SnippetSidebarButton {...props} size={ICON_SIZE} className="mt3" />
      ) : null}
      {PreviewQueryButton.shouldRender({ question }) && (
        <PreviewQueryButton {...props} />
      )}
      {!!canRunQuery && (
        <RunButtonWithTooltipStyled
          disabled={!isRunnable}
          isRunning={isRunning}
          isDirty={isResultDirty}
          onRun={runQuery}
          onCancel={cancelQuery}
          compact
          getTooltip={getTooltip}
        />
      )}
    </Container>
  );
};

NativeQueryEditorSidebar.propTypes = propTypes;

export default NativeQueryEditorSidebar;
