import { useEffect, useRef } from "react";

import { hasSdkAttributionBadge } from "embedding-sdk/lib/attribution";
import { trackSimpleEvent } from "metabase/lib/analytics";
import { LogoBadge } from "metabase/public/components/EmbedFrame/LogoBadge";

export const SdkAttribution = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTimeout(() => {
      const hasAttribution = hasSdkAttributionBadge(containerRef.current);

      // eslint-disable-next-line no-console -- for debugging, to remove.
      console.log(`[logo:attr] ${hasAttribution}`);

      trackSimpleEvent({
        event: "embedding-sdk-element-loaded",
        triggered_from: "embedding-sdk",
        event_detail: `host=${window.location.hostname}&has_attribution=${hasAttribution}`,
      });
    }, 3000);
  }, []);

  return (
    <div ref={containerRef}>
      <LogoBadge dark={false} />
    </div>
  );
};
