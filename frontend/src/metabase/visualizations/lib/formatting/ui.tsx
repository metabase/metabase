import cx from "classnames";
import type { ReactElement, ReactNode } from "react";

import { handleLinkSdkPlugin } from "embedding-sdk-shared/lib/sdk-global-plugins";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Link } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { getSitePath, isSameOrSiteUrlOrigin } from "metabase/utils/dom";

import { registerJsxLinkRenderer } from "./registry";

// A same-origin *relative* url (e.g. "/dashboard/5") is always meant to be
// resolved within the app. A same-origin *absolute* url is only an in-app
// link if its own path actually falls under the site's base path --
// otherwise routing it through the in-app <Link> (which prepends that base
// path) mangles urls that just happen to share the site's origin, e.g. a
// site at https://host/insights/ linking to https://host/api/assets/1
// becomes https://host/insights/api/assets/1 (metabase#77352).
function isInAppLink(url: string): boolean {
  if (!isSameOrSiteUrlOrigin(url)) {
    return false;
  }
  if (!/^https?:\/\//i.test(url)) {
    return true;
  }
  return new URL(url).pathname.toLowerCase().startsWith(getSitePath());
}

function renderJsxLink(url: string, text: ReactNode): ReactElement {
  const className = cx(CS.link, CS.linkWrappable);

  // on the react sdk we treat all user provided urls as external links
  if (isInAppLink(url) && !isEmbeddingSdk()) {
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

export function registerJsxFormatting() {
  registerJsxLinkRenderer(renderJsxLink);
}
