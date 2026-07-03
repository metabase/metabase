import { useSyncExternalStore } from "react";

import {
  getNewQuerySqlFullPage,
  parseNewQueryMode,
  requestNewQuerySqlExpand,
  subscribeNewQuerySqlFullPage,
} from "metabase/nav/containers/ProtoNavbar/newQuery";
import { useSelector } from "metabase/redux";
import { getLocation } from "metabase/selectors/routing";

import { VisibilityToggler as VisibilityTogglerControl } from "../VisibilityToggler/VisibilityToggler";
import { useNativeQueryEditorContext } from "../context/NativeQueryEditorContext";

/**
 * The open/close toggle for the editor. Renders nothing unless the query is
 * writable, the question is not archived, and the consumer wired up the
 * open/close handlers.
 *
 * On the New Query SQL idle card, this becomes an expand control that grows
 * the editor to the full-page layout instead of collapsing it.
 */
export function VisibilityToggler() {
  const {
    query,
    question,
    isNativeEditorOpen,
    readOnly,
    setIsNativeEditorOpen,
    toggleEditor,
  } = useNativeQueryEditorContext();
  const { pathname } = useSelector(getLocation);
  const isSqlFullPage = useSyncExternalStore(
    subscribeNewQuerySqlFullPage,
    getNewQuerySqlFullPage,
  );

  if (
    !query.hasWritePermission() ||
    question.isArchived() ||
    !setIsNativeEditorOpen
  ) {
    return null;
  }

  const isNewQuerySqlIdleCard =
    parseNewQueryMode(pathname) === "sql" && !isSqlFullPage;

  if (isNewQuerySqlIdleCard) {
    return (
      <VisibilityTogglerControl
        isOpen={false}
        forceExpand
        readOnly={!!readOnly}
        toggleEditor={requestNewQuerySqlExpand}
      />
    );
  }

  return (
    <VisibilityTogglerControl
      isOpen={isNativeEditorOpen}
      readOnly={!!readOnly}
      toggleEditor={toggleEditor}
    />
  );
}
