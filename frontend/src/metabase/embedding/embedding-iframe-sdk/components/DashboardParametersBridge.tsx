import { type ReactNode, useCallback } from "react";

import type { DashboardParameterChangePayload } from "embedding-sdk-bundle/types/dashboard";
import { isEmbeddingEajs } from "metabase/embedding-sdk/config";

import { sendMessage } from "../hooks/use-sdk-iframe-embed-event-bus";

type DashboardParametersBridgeProps = {
  children: (api: {
    onParametersChange: (payload: DashboardParameterChangePayload) => void;
  }) => ReactNode;
};

export const DashboardParametersBridge = ({
  children,
}: DashboardParametersBridgeProps) => {
  const onParametersChange = useCallback(
    (payload: DashboardParameterChangePayload) => {
      if (!isEmbeddingEajs()) {
        return;
      }

      sendMessage({
        type: "metabase.embed.parametersChange",
        data: payload,
      });
    },
    [],
  );

  return <>{children({ onParametersChange })}</>;
};
