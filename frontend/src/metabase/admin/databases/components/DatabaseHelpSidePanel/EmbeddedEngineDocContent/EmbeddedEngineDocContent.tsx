import { useRef } from "react";
import ReactMarkdown from "react-markdown";
import { useMount } from "react-use";

import type { EngineKey } from "metabase-types/api";

import S from "./EmbeddedEngineDocContent.module.css";
import { useEngineDocMarkdownContent } from "./useEngineDocMarkdownContent";
import {
  hideUnnecessaryMarkdownElements,
  markdownComponentsOverride,
} from "./utils";

interface Props {
  engineKey: EngineKey;
}

export const EmbeddedEngineDocContent = ({ engineKey }: Props) => {
  const engineDocContent = useEngineDocMarkdownContent(engineKey);
  const markdownRef = useRef<HTMLDivElement>(null);

  useMount(() => {
    if (!markdownRef.current) {
      return;
    }

    const observer = new MutationObserver(() => {
      // Using observer to ensure hideUnnecessaryMarkdownElements is called after the markdown is rendered
      hideUnnecessaryMarkdownElements(markdownRef.current);
    });

    observer.observe(markdownRef.current, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
    };
  });

  return (
    <div ref={markdownRef}>
      <ReactMarkdown
        className={S.markdown}
        components={markdownComponentsOverride}
      >
        {engineDocContent || ""}
      </ReactMarkdown>
    </div>
  );
};
