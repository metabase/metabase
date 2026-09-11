import cx from "classnames";
import Mustache from "mustache";
import type { ReactElement, ReactNode } from "react";
import ReactMarkdown from "react-markdown";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Link } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import { PLUGIN_HOST_NAVIGATION, getUrlTarget } from "metabase/urls";
import { isSameOrSiteUrlOrigin } from "metabase/utils/dom";
import {
  type MarkdownTemplateValues,
  registerJsxEmailRenderer,
  registerJsxLinkRenderer,
  registerJsxMarkdownRenderer,
} from "metabase/value-formatting";

function renderJsxLink(url: string, text: ReactNode): ReactElement {
  const className = cx(CS.link, CS.linkWrappable);

  const handleLink = PLUGIN_HOST_NAVIGATION.host?.handleLink;
  const onClickCaptureByHost = handleLink
    ? {
        onClickCapture: async (e: React.MouseEvent<HTMLAnchorElement>) => {
          e.preventDefault(); // Prevent immediately while we await the response
          const handled = await handleLink(url);
          if (!handled) {
            window.open(url, getUrlTarget(url), "noopener");
          }
        },
      }
    : {};

  if (
    isSameOrSiteUrlOrigin(url) &&
    PLUGIN_HOST_NAVIGATION.host?.sameOriginTarget !== "_blank"
  ) {
    return (
      <Link className={className} to={url} {...onClickCaptureByHost}>
        {text}
      </Link>
    );
  }

  return (
    <ExternalLink className={className} href={url} {...onClickCaptureByHost}>
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
