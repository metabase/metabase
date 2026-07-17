import cx from "classnames";
import type { ReactElement, ReactNode } from "react";

import { handleLinkSdkPlugin } from "embedding-sdk-shared/lib/sdk-global-plugins";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Link } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { isSameOrSiteUrlOrigin } from "metabase/utils/dom";

export function renderJsxLink(url: string, text: ReactNode): ReactElement {
  const className = cx(CS.link, CS.linkWrappable);

  // on the react sdk we treat all user provided urls as external links
  if (isSameOrSiteUrlOrigin(url) && !isEmbeddingSdk()) {
    return (
      <Link className={className} to={url}>
        {text}
      </Link>
    );
  }

  const onClickCaptureInSdk = isEmbeddingSdk()
    ? {
        onClickCapture: async (e: React.MouseEvent<HTMLAnchorElement>) => {
          e.preventDefault(); // Prevent immediately while we await the response
          const result = await handleLinkSdkPlugin(url);
          if (!result.handled) {
            // Parent didn't handle it - proceed with default navigation
            window.open(url, "_blank", "noopener");
          }
        },
      }
    : {};

  return (
    <ExternalLink className={className} href={url} {...onClickCaptureInSdk}>
      {text}
    </ExternalLink>
  );
}
