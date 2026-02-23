import type { Location } from "history";
import { useLocation } from "react-router-dom";

import { useEmbedFrameOptions } from "metabase/public/hooks";

import type { EmbedFrameProps } from "./EmbedFrame";
import { EmbedFrame } from "./EmbedFrame";

export const SyncedEmbedFrame = ({
  children,
  ...embedFrameProps
}: Partial<EmbedFrameProps>) => {
  const location = useLocation();
  const { background, bordered, hide_parameters, theme, titled } =
    useEmbedFrameOptions({ location: location as unknown as Location });

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
