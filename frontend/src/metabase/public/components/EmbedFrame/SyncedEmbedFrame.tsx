import { useEmbedFrameOptions } from "metabase/public/hooks";
import { useRouter } from "metabase/router";

import type { EmbedFrameProps } from "./EmbedFrame";
import { EmbedFrame } from "./EmbedFrame";

export const SyncedEmbedFrame = ({
  children,
  ...embedFrameProps
}: Partial<EmbedFrameProps>) => {
  const { location } = useRouter();
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
