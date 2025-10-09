import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import type { JSONContent } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo } from "react";
import { useAsync } from "react-use";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { PublicApi } from "metabase/services";
import { Box } from "metabase/ui";
import {
  CardEmbed,
  DROP_ZONE_COLOR,
} from "metabase-enterprise/rich_text_editing/tiptap/extensions/CardEmbed/CardEmbedNode";
import { CustomStarterKit } from "metabase-enterprise/rich_text_editing/tiptap/extensions/CustomStarterKit/CustomStarterKit";
import { FlexContainer } from "metabase-enterprise/rich_text_editing/tiptap/extensions/FlexContainer/FlexContainer";
import { ResizeNode } from "metabase-enterprise/rich_text_editing/tiptap/extensions/ResizeNode/ResizeNode";
import { SmartLink } from "metabase-enterprise/rich_text_editing/tiptap/extensions/SmartLink/SmartLinkNode";
import type { Document } from "metabase-types/api";

interface PublicDocumentProps {
  params: {
    uuid: string;
  };
}

export const PublicDocument = ({ params }: PublicDocumentProps) => {
  const { uuid } = params;
  const siteUrl = useSelector((state) => getSetting(state, "site-url"));

  const {
    value: document,
    loading,
    error,
  } = useAsync(async () => {
    const doc = await PublicApi.document({ uuid });
    return doc as Document;
  }, [uuid]);

  const extensions = useMemo(
    () => [
      CustomStarterKit.configure({
        dropcursor: {
          color: DROP_ZONE_COLOR,
          width: 2,
        },
      }),
      Image.configure({
        inline: false,
      }),
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
    ],
    [siteUrl],
  );

  const editor = useEditor(
    {
      extensions,
      content: (document?.document as JSONContent) || "",
      editable: false,
      immediatelyRender: false,
    },
    [document?.document],
  );

  useEffect(() => {
    if (editor && document?.document) {
      editor.commands.setContent(document.document as JSONContent);
    }
  }, [editor, document?.document]);

  useEffect(() => {
    if (document) {
      document.title = document.name;
    }
  }, [document]);

  return (
    <LoadingAndErrorWrapper
      loading={loading}
      error={error}
      noBackground
      style={{
        display: "flex",
        flex: 1,
        flexDirection: "column",
      }}
    >
      {document && editor && (
        <Box maw={900} mx="auto" p="xl" w="100%">
          <h1 style={{ marginBottom: "1rem" }}>{document.name}</h1>
          <EditorContent editor={editor} />
        </Box>
      )}
    </LoadingAndErrorWrapper>
  );
};
