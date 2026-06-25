import Image from "@tiptap/extension-image";
import { Link } from "@tiptap/extension-link";
import type { JSONContent } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Location } from "history";
import { useEffect, useMemo } from "react";
import { useAsync, useMount } from "react-use";

import { publicApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { DocumentEditorHostProvider } from "metabase/documents/components/Editor/DocumentEditorHost";
import { EmbeddingEntityContextProvider } from "metabase/embedding/context";
import { EmbedFrame } from "metabase/public/components/EmbedFrame";
import { useEmbedFrameOptions } from "metabase/public/hooks";
import { useDispatch, useSelector } from "metabase/redux";
import { setErrorPage } from "metabase/redux/app";
import { CardEmbed } from "metabase/rich_text_editing/tiptap/extensions/CardEmbed/CardEmbedNode";
import { ExternalCardDataProvider } from "metabase/rich_text_editing/tiptap/extensions/CardEmbed/ExternalCardDataContext";
import { CustomStarterKit } from "metabase/rich_text_editing/tiptap/extensions/CustomStarterKit/CustomStarterKit";
import { FlexContainer } from "metabase/rich_text_editing/tiptap/extensions/FlexContainer/FlexContainer";
import { MetabotNode } from "metabase/rich_text_editing/tiptap/extensions/MetabotEmbed";
import { ResizeNode } from "metabase/rich_text_editing/tiptap/extensions/ResizeNode/ResizeNode";
import { SmartLink } from "metabase/rich_text_editing/tiptap/extensions/SmartLink/SmartLinkNode";
import { SupportingText } from "metabase/rich_text_editing/tiptap/extensions/SupportingText/SupportingText";
import { DROP_ZONE_COLOR } from "metabase/rich_text_editing/tiptap/extensions/shared/constants";
import { getSetting } from "metabase/selectors/settings";
import { Box } from "metabase/ui";
import { initializeIframeResizer } from "metabase/utils/dom";
import type { Document } from "metabase-types/api";

import S from "./PublicDocument.module.css";

interface PublicDocumentProps {
  location: Location;
  params: {
    uuid: string;
  };
}

export const PublicDocument = ({ location, params }: PublicDocumentProps) => {
  const { uuid } = params;
  const dispatch = useDispatch();
  const siteUrl = useSelector((state) => getSetting(state, "site-url"));

  const { theme } = useEmbedFrameOptions({ location });
  const hasEmbedBranding = useSelector(
    (state) => !getSetting(state, "hide-embed-branding?"),
  );

  const {
    value: document,
    loading,
    error,
  } = useAsync(async () => {
    const doc = await runRtkEndpoint(
      { uuid },
      dispatch,
      publicApi.endpoints.getPublicDocument,
    );
    return doc as Document;
  }, [uuid, dispatch]);

  useEffect(() => {
    if (error) {
      dispatch(setErrorPage(error));
    }
  }, [dispatch, error]);

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
      SupportingText,
      MetabotNode,
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
      // Set the page title for the browser tab
      window.document.title = document.name;
    }
  }, [document]);

  useMount(() => {
    // Initialize iframe resizer for dynamic height adjustment when embedded
    initializeIframeResizer();
  });

  const externalCardDataValue = useMemo(
    () => ({
      cards: document?.cards ?? {},
      documentUuid: uuid,
    }),
    [document?.cards, uuid],
  );

  return (
    <EmbeddingEntityContextProvider uuid={uuid} token={null}>
      <EmbedFrame
        theme={theme}
        titled={false}
        className={S.container}
        contentClassName={S.documentArea}
        background={false}
        withFooter={hasEmbedBranding}
      >
        <LoadingAndErrorWrapper
          loading={loading}
          noBackground
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
          }}
        >
          {document && editor && (
            <DocumentEditorHostProvider>
              <ExternalCardDataProvider value={externalCardDataValue}>
                <Box maw={900} mx="auto" p="xl" w="100%">
                  <h1 style={{ marginBottom: "1rem" }}>{document.name}</h1>
                  <div className={S.editorContent}>
                    <EditorContent
                      data-testid="document-content"
                      editor={editor}
                    />
                  </div>
                </Box>
              </ExternalCardDataProvider>
            </DocumentEditorHostProvider>
          )}
        </LoadingAndErrorWrapper>
      </EmbedFrame>
    </EmbeddingEntityContextProvider>
  );
};
