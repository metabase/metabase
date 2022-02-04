import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { isMac } from "metabase/lib/browser";

import DataReferenceButton from "metabase/query_builder/components/view/DataReferenceButton";
import NativeVariablesButton from "metabase/query_builder/components/view/NativeVariablesButton";
import SnippetSidebarButton from "metabase/query_builder/components/view/SnippetSidebarButton";

import {
  Container,
  RunButtonWithTooltipStyled,
} from "./NativeQueryEditorSidebar.styled";

const propTypes = {
  cancelQuery: PropTypes.func.isRequired,
  isPreviewing: PropTypes.bool.isRequired,
  isResultDirty: PropTypes.bool.isRequired,
  isRunnable: PropTypes.bool.isRequired,
  isRunning: PropTypes.bool.isRequired,
  nativeEditorSelectedText: PropTypes.string,
  runQuery: PropTypes.func.isRequired,
  snippetCollections: PropTypes.array,
  snippets: PropTypes.array,
};

const ICON_SIZE = 18;

const NativeQueryEditorSidebar = props => {
  const {
    cancelQuery,
    isPreviewing,
    isResultDirty,
    isRunnable,
    isRunning,
    nativeEditorSelectedText,
    runQuery,
    snippetCollections,
    snippets,
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

  return (
    <Container>
      <DataReferenceButton {...props} size={ICON_SIZE} className="mt3" />
      <NativeVariablesButton {...props} size={ICON_SIZE} className="mt3" />
      {showSnippetSidebarButton && (
        <SnippetSidebarButton {...props} size={ICON_SIZE} className="mt3" />
      )}
      <RunButtonWithTooltipStyled
        disabled={!isRunnable}
        isRunning={isRunning}
        isDirty={isResultDirty}
        isPreviewing={isPreviewing}
        onRun={runQuery}
        onCancel={cancelQuery}
        compact
        getTooltip={getTooltip}
      />
    </Container>
  );
};

NativeQueryEditorSidebar.propTypes = propTypes;

export default NativeQueryEditorSidebar;
