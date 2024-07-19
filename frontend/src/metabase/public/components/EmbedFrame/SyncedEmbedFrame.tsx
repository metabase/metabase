import type { WithRouterProps } from "react-router";
import { withRouter } from "react-router";

import { useEmbedFrameOptions } from "metabase/public/hooks";

import type { EmbedFrameProps } from "./EmbedFrame";
import { EmbedFrame } from "./EmbedFrame";

const SyncedEmbedFrameInner = ({
  location,
  children,
  ...embedFrameProps
}: Partial<EmbedFrameProps> & WithRouterProps) => {
  const {
    background,
    bordered,
    hide_download_button,
    hide_parameters,
    theme,
    titled,
  } = useEmbedFrameOptions({ location });

  return (
    <EmbedFrame
      {...embedFrameProps}
      background={background}
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

export const SyncedEmbedFrame = withRouter<Partial<EmbedFrameProps>>(
  SyncedEmbedFrameInner,
);
