import { type ReactNode, useCallback } from "react";

import type { SqlParameterChangePayload } from "embedding-sdk-bundle/types/question";
import { isEmbeddingEajs } from "metabase/embedding-sdk/config";

import { sendMessage } from "../hooks/use-sdk-iframe-embed-event-bus";

type QuestionParametersBridgeProps = {
  children: (api: {
    onSqlParametersChange: (payload: SqlParameterChangePayload) => void;
  }) => ReactNode;
};

export const QuestionParametersBridge = ({
  children,
}: QuestionParametersBridgeProps) => {
  const onSqlParametersChange = useCallback(
    (payload: SqlParameterChangePayload) => {
      if (!isEmbeddingEajs()) {
        return;
      }

      sendMessage({
        type: "metabase.embed.sqlParametersChange",
        data: payload,
      });
    },
    [],
  );

  return <>{children({ onSqlParametersChange })}</>;
};
