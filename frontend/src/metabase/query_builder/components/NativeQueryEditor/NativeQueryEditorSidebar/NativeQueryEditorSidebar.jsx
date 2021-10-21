/* eslint-disable react/prop-types */

import React from "react";
import { t } from "ttag";

import { isMac } from "metabase/lib/browser";

import RunButtonWithTooltip from "metabase/query_builder/components/RunButtonWithTooltip";
import DataReferenceButton from "metabase/query_builder/components/view/DataReferenceButton";
import NativeVariablesButton from "metabase/query_builder/components/view/NativeVariablesButton";
import SnippetSidebarButton from "metabase/query_builder/components/view/SnippetSidebarButton";

const ICON_SIZE = 18;

const NativeQueryEditorSidebar = props => {
  const {
    cancelQuery,
    isRunnable,
    isRunning,
    isResultDirty,
    isPreviewing,
    nativeEditorSelectedText,
    runQuery,
    snippetCollections,
    snippets,
  } = props;

  // hide the snippet sidebar if there aren't any visible snippets/collections and the root collection isn't writable
  const showSnippetSidebarButton = !(
    snippets?.length === 0 &&
    snippetCollections?.length === 1 &&
    snippetCollections[0].can_write === false
  );

  return (
    <div className="flex flex-column align-center">
      <DataReferenceButton {...props} size={ICON_SIZE} className="mt3" />
      <NativeVariablesButton {...props} size={ICON_SIZE} className="mt3" />
      {showSnippetSidebarButton && (
        <SnippetSidebarButton {...props} size={ICON_SIZE} className="mt3" />
      )}
      <RunButtonWithTooltip
        disabled={!isRunnable}
        isRunning={isRunning}
        isDirty={isResultDirty}
        isPreviewing={isPreviewing}
        onRun={runQuery}
        onCancel={() => cancelQuery()}
        compact
        className="mx2 mb2 mt-auto"
        style={{ width: 40, height: 40 }}
        getTooltip={() =>
          (nativeEditorSelectedText ? t`Run selected text` : t`Run query`) +
          " " +
          (isMac() ? t`(⌘ + enter)` : t`(Ctrl + enter)`)
        }
      />
    </div>
  );
};

export default NativeQueryEditorSidebar;
