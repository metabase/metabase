import { useEffect, useState } from "react";
import type { CardId } from "metabase-types/api";
import API from "metabase/lib/api";
import { QueryVisualizationNoContext } from "metabase/iframe/QueryVisualizationNoContext";

export const IFrameWrapper = ({
  params,
}: {
  params: {
    id: CardId;
  };
}) => {
  const [token, setToken] = useState<string | null>(null);
  const questionId = params.id;

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === "metabase-token") {
        setToken(event.data.token.id);
        API.sessionToken = event.data.token.id;
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      API.sessionToken = "";
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  return token && questionId ? (
    <QueryVisualizationNoContext questionId={questionId} />
  ) : null;
};
