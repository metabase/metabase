import { useEffect, useMemo } from "react";
import { useAsync, useMount } from "react-use";

import { publicApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DocumentReadOnlyView } from "metabase/documents/components/DocumentReadOnlyView";
import { ExternalCardDataProvider } from "metabase/documents/components/editor-extensions/CardEmbed/ExternalCardDataContext";
import { EmbeddingEntityContextProvider } from "metabase/embedding/context";
import { EmbedFrame } from "metabase/public/components/EmbedFrame";
import { useEmbedFrameOptions } from "metabase/public/hooks";
import { useDispatch, useSelector } from "metabase/redux";
import { setErrorPage } from "metabase/redux/app";
import { useLocation, useParams } from "metabase/router";
import { getSetting } from "metabase/settings";
import { Box } from "metabase/ui";
import { initializeIframeResizer } from "metabase/utils/dom";
import type { Document } from "metabase-types/api";

import S from "./PublicDocument.module.css";

export const PublicDocument = () => {
  const location = useLocation();
  const { uuid = "" } = useParams<{ uuid: string }>();
  const dispatch = useDispatch();

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
    // Unjustified type cast. FIXME
    return doc as Document;
  }, [uuid, dispatch]);

  useEffect(() => {
    if (error) {
      dispatch(setErrorPage(error));
    }
  }, [dispatch, error]);

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
          {document && (
            <ExternalCardDataProvider value={externalCardDataValue}>
              <Box maw={900} mx="auto" p="xxl" w="100%">
                <h1 style={{ marginBottom: "1rem" }}>{document.name}</h1>
                <DocumentReadOnlyView content={document.document} />
              </Box>
            </ExternalCardDataProvider>
          )}
        </LoadingAndErrorWrapper>
      </EmbedFrame>
    </EmbeddingEntityContextProvider>
  );
};
