import { VisibilityToggler as VisibilityTogglerControl } from "../VisibilityToggler/VisibilityToggler";
import { useNativeQueryEditorContext } from "../context/NativeQueryEditorContext";

/**
 * The open/close toggle for the editor. Renders nothing unless the query is
 * writable, the question is not archived, and the consumer wired up the
 * open/close handlers.
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

  if (
    !query.hasWritePermission() ||
    question.isArchived() ||
    !setIsNativeEditorOpen
  ) {
    return null;
  }

  return (
    <VisibilityTogglerControl
      isOpen={isNativeEditorOpen}
      readOnly={!!readOnly}
      toggleEditor={toggleEditor}
    />
  );
}
