import Image from "@tiptap/extension-image";
import { Link } from "@tiptap/extension-link";
import { EditorContent, useEditor } from "@tiptap/react";
import { useMemo } from "react";

import CS from "metabase/css/core/index.css";
import {
  type DocumentEditorHost,
  DocumentEditorHostProvider,
} from "metabase/documents/components/Editor/DocumentEditorHost";
import ProseS from "metabase/documents/components/Editor/prose.module.css";
import { CardEmbed } from "metabase/documents/components/editor-extensions/CardEmbed/CardEmbedNode";
import { MetabotNode } from "metabase/metabot/components/editor-extensions/MetabotEmbed";
import { useSelector } from "metabase/redux";
import { DEFAULT_EDITOR_CAPABILITIES } from "metabase/rich_text_editing/tiptap/EditorHost";
import { CustomStarterKit } from "metabase/rich_text_editing/tiptap/extensions/CustomStarterKit/CustomStarterKit";
import { FlexContainer } from "metabase/rich_text_editing/tiptap/extensions/FlexContainer/FlexContainer";
import { ResizeNode } from "metabase/rich_text_editing/tiptap/extensions/ResizeNode/ResizeNode";
import { SmartLink } from "metabase/rich_text_editing/tiptap/extensions/SmartLink/SmartLinkNode";
import { SupportingText } from "metabase/rich_text_editing/tiptap/extensions/SupportingText/SupportingText";
import { getSetting } from "metabase/settings";
import type { DocumentContent } from "metabase-types/api";

const READ_ONLY_HOST: Partial<DocumentEditorHost> = {
  capabilities: { ...DEFAULT_EDITOR_CAPABILITIES, canEdit: false },
};

type DocumentReadOnlyViewProps = {
  content: DocumentContent;
};

/**
 * A document's content rendered read-only, card embeds included. The embeds
 * load their own data unless an `ExternalCardDataProvider` above supplies it.
 */
export function DocumentReadOnlyView({ content }: DocumentReadOnlyViewProps) {
  const siteUrl = useSelector((state) => getSetting(state, "site-url"));

  const extensions = useMemo(
    () => [
      CustomStarterKit,
      Image,
      SmartLink.configure({
        HTMLAttributes: {
          class: "smart-link",
        },
        siteUrl,
      }),
      Link.configure({
        HTMLAttributes: {
          class: CS.link,
        },
      }),
      CardEmbed,
      FlexContainer,
      ResizeNode,
      SupportingText,
      MetabotNode,
    ],
    [siteUrl],
  );

  const editor = useEditor(
    {
      extensions,
      content,
      editable: false,
      immediatelyRender: false,
    },
    // Swapping the content of a mounted editor renders card embeds through
    // tiptap's flushSync inside React's commit, so new content gets a new editor.
    [content],
  );

  if (editor == null) {
    return null;
  }

  return (
    <DocumentEditorHostProvider hostOverride={READ_ONLY_HOST}>
      <div className={ProseS.prose}>
        <EditorContent data-testid="document-content" editor={editor} />
      </div>
    </DocumentEditorHostProvider>
  );
}
