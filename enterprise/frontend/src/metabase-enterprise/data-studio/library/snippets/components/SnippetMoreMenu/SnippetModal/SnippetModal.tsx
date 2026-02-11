import { PLUGIN_SNIPPET_FOLDERS } from "metabase/plugins";
import type { NativeQuerySnippet } from "metabase-types/api";

import { ArchiveSnippetModal } from "./ArchiveSnippetModal";
import { UnarchiveSnippetModal } from "./UnarchiveSnippetModal";

export type SnippetModalType = "move" | "archive" | "unarchive";

type SnippetModalProps = {
  snippet: NativeQuerySnippet;
  modalType: SnippetModalType;
  onClose: () => void;
};

export function SnippetModal({
  snippet,
  modalType,
  onClose,
}: SnippetModalProps) {
  switch (modalType) {
    case "move":
      return (
        <PLUGIN_SNIPPET_FOLDERS.MoveSnippetModal
          snippet={snippet}
          onClose={onClose}
        />
      );
    case "archive":
      return <ArchiveSnippetModal snippet={snippet} onClose={onClose} />;
    case "unarchive":
      return <UnarchiveSnippetModal snippet={snippet} onClose={onClose} />;
    default:
      return null;
  }
}
