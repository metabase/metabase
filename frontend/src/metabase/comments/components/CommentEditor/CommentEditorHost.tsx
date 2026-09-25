import { type ReactNode, useMemo } from "react";

import { useEntityData } from "metabase/comments/hooks/use-entity-data";
import {
  EditorHostProvider,
  useEditorHost,
} from "metabase/rich_text_editing/tiptap/EditorHost";

export const CommentEditorHostProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const host = useEditorHost();
  const value = useMemo(() => ({ ...host, useEntityData }), [host]);

  return <EditorHostProvider value={value}>{children}</EditorHostProvider>;
};
