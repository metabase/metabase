import type { WithRouterProps } from "react-router";
import { withRouter } from "react-router";

import { useEmbedFrameOptions } from "metabase/public/hooks";

import type { EmbedFrameProps } from "./EmbedFrame";
import { EmbedFrame } from "./EmbedFrame";

const SyncedEmbedFrameInner = ({
  location,
  children,
  ...embedFrameProps
}: EmbedFrameProps & WithRouterProps) => {
  const { bordered, hide_download_button, hide_parameters, theme, titled } =
    useEmbedFrameOptions({ location });

  return (
    <EmbedFrame
      {...embedFrameProps}
      bordered={bordered}
      titled={titled}
      theme={theme}
      hide_parameters={hide_parameters}
      hide_download_button={hide_download_button}
    >
      {children}
    </EmbedFrame>
  );
};

export const SyncedEmbedFrame = withRouter<EmbedFrameProps>(
  SyncedEmbedFrameInner,
);
