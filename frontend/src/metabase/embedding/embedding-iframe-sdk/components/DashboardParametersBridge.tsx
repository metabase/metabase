import { type ReactNode, useCallback } from "react";

import type { ParameterChangePayload } from "embedding-sdk-bundle/types/dashboard";
import { isEmbeddingEajs } from "metabase/embedding-sdk/config";

import { sendMessage } from "../hooks/use-sdk-iframe-embed-event-bus";

type DashboardParametersBridgeProps = {
  children: (api: {
    onParametersChange: (payload: ParameterChangePayload) => void;
  }) => ReactNode;
};

export const DashboardParametersBridge = ({
  children,
}: DashboardParametersBridgeProps) => {
  const onParametersChange = useCallback((payload: ParameterChangePayload) => {
    if (!isEmbeddingEajs()) {
      return;
    }

    sendMessage({
      type: "metabase.embed.parametersChange",
      data: payload,
    });
  }, []);

  return <>{children({ onParametersChange })}</>;
};
