import { useRef } from "react";
import { useMount } from "react-use";

import { Markdown } from "metabase/common/components/Markdown";
import { Alert, Box, Loader, Text } from "metabase/ui";
import type { EngineKey } from "metabase-types/api";

import S from "./EmbeddedEngineDocContent.module.css";
import { MarkdownLink } from "./MarkdownLink";
import { hideUnnecessaryElements } from "./markdown-utils";
import { useEngineDocMarkdownContent } from "./useEngineDocMarkdownContent";

interface Props {
  engineKey: EngineKey;
}

const markdownComponentsOverride = {
  a: MarkdownLink,
};

export const EmbeddedEngineDocContent = ({ engineKey }: Props) => {
  const { markdownContent, isLoading, loadingError } =
    useEngineDocMarkdownContent(engineKey);
  const markdownRef = useRef<HTMLDivElement>(null);

  useMount(() => {
    if (!markdownRef.current) {
      return;
    }

    const observer = new MutationObserver(() => {
      // Using observer to ensure hideUnnecessaryElements is called after the markdown is rendered
      hideUnnecessaryElements(markdownRef.current);
    });

    observer.observe(markdownRef.current, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
    };
  });

  return (
    <Box ref={markdownRef} w="100%">
      {loadingError && (
        <Alert color="info" variant="outline" mt="xl">
          <Text>{loadingError}</Text>
        </Alert>
      )}
      {isLoading ? (
        <Loader mx="auto" mt="xl" display="block" data-testid="loader" />
      ) : (
        <Markdown
          className={S.markdown}
          components={markdownComponentsOverride}
        >
          {markdownContent || ""}
        </Markdown>
      )}
    </Box>
  );
};
