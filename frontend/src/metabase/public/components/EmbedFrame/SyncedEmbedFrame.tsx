import { useEmbedFrameOptions } from "metabase/public/hooks";
import type { WithRouterProps } from "metabase/router";
import { withRouter } from "metabase/router";

import type { EmbedFrameProps } from "./EmbedFrame";
import { EmbedFrame } from "./EmbedFrame";

const SyncedEmbedFrameInner = ({
  location,
  children,
  ...embedFrameProps
}: Partial<EmbedFrameProps> & WithRouterProps) => {
  const { background, bordered, hide_parameters, theme, titled } =
    useEmbedFrameOptions({ location });

  return (
    <EmbedFrame
      {...embedFrameProps}
      background={background}
      bordered={bordered}
      titled={titled}
      theme={theme}
      hide_parameters={hide_parameters}
    >
      {children}
    </EmbedFrame>
  );
};

export const SyncedEmbedFrame = withRouter<Partial<EmbedFrameProps>>(
  SyncedEmbedFrameInner,
);
