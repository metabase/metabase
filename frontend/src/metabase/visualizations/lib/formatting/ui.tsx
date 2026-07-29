import cx from "classnames";
import Mustache from "mustache";
import type { ReactElement, ReactNode } from "react";
import ReactMarkdown from "react-markdown";

import { handleLinkSdkPlugin } from "embedding-sdk-shared/lib/sdk-global-plugins";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Link } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { isSameOrSiteUrlOrigin } from "metabase/utils/dom";

import {
  type MarkdownTemplateValues,
  registerJsxEmailRenderer,
  registerJsxLinkRenderer,
  registerJsxMarkdownRenderer,
} from "./registry";

function renderJsxLink(url: string, text: ReactNode): ReactElement {
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

const MARKDOWN_RENDERERS = {
  a: ({ href, children }: any) => (
    <ExternalLink href={href}>{children}</ExternalLink>
  ),
};

function renderJsxMarkdown(
  template: string,
  values: MarkdownTemplateValues,
): ReactElement {
  const markdown = Mustache.render(template, values);
  return (
    <ReactMarkdown components={MARKDOWN_RENDERERS}>{markdown}</ReactMarkdown>
  );
}

function renderJsxEmail(mailto: string, text: ReactNode): ReactElement {
  return <ExternalLink href={mailto}>{text}</ExternalLink>;
}

export function registerJsxFormatting() {
  registerJsxLinkRenderer(renderJsxLink);
  registerJsxMarkdownRenderer(renderJsxMarkdown);
  registerJsxEmailRenderer(renderJsxEmail);
}
