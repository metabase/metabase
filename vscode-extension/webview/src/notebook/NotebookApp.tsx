import { useEffect, useMemo, useState } from "react";
import { ReadOnlyNotebook } from "../../../vendor/notebook-component.esm.js";
import type {
  ExtensionToNotebookMessage,
  NotebookData,
} from "../../../src/shared-types";
import { vscode } from "../vscode";
import { buildMetadata, buildQuestion } from "./question-proxy";

export function NotebookApp() {
  const [data, setData] = useState<NotebookData | null>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent<ExtensionToNotebookMessage>) {
      const message = event.data;
      if (
        message.type === "notebookInit" ||
        message.type === "notebookUpdate"
      ) {
        setData(message.data);
      }
    }

    window.addEventListener("message", handleMessage);
    vscode.postMessage({ type: "ready" });

    return () => window.removeEventListener("message", handleMessage);
  }, []);

  if (!data) {
    return null;
  }

  return <NotebookView data={data} />;
}

function NotebookView({ data }: { data: NotebookData }) {
  const question = useMemo(() => {
    if (!data.datasetQuery || !data.metadata) {
      return null;
    }
    const metadata = buildMetadata(data.metadata);
    return buildQuestion(data.datasetQuery, metadata, data.cardType);
  }, [data.datasetQuery, data.metadata, data.cardType]);

  if (!question) {
    if (data.queryType === "native" && data.nativeSql) {
      return (
        <div style={{ padding: "1rem" }}>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--vscode-editor-font-family)" }}>
            {data.nativeSql}
          </pre>
        </div>
      );
    }
    return <div style={{ padding: "1rem" }}>Unable to parse query</div>;
  }

  return <ReadOnlyNotebook question={question as any} />;
}
