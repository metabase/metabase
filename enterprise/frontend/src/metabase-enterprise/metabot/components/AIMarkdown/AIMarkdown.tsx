// TODO: consolidate this component w/ AIAnalysisContent

import cx from "classnames";
import { memo, useMemo } from "react";

import Link from "metabase/common/components/Link/Link";
import Markdown, {
  type MarkdownProps,
} from "metabase/common/components/Markdown";

import { MetabotSmartLinkComponent } from "../MetabotChat/MetabotChatEditor/MetabotSmartLink";

import S from "./AIMarkdown.module.css";

type AIMarkdownProps = MarkdownProps & {
  onInternalLinkClick?: (link: string) => void;
};

const getComponents = ({
  onInternalLinkClick,
}: Pick<AIMarkdownProps, "onInternalLinkClick">) => ({
  a: ({
    href,
    children,
    node,
    ...rest
  }: {
    href?: string;
    children?: any;
    node?: any;
    [key: string]: any;
  }) => {
    // TODO: type this properly
    const isMetabaseProtocolLink = node?.properties?.href?.startsWith(
      "metabase://",
    ) as boolean;

    if (isMetabaseProtocolLink) {
      const link = node?.properties?.href.slice("metabase://".length);
      // TODO: FIX - having some trouble with the utils parse this correctly
      const [model, entityId] = link.split("/");

      // A custom handler for internal links (use by Embedding SDK)
      if (onInternalLinkClick) {
        return (
          <span className="smart-link">
            <MetabotSmartLinkComponent
              model={model}
              entityId={entityId}
              {...rest}
            />
          </span>
        );
      }

      return (
        <Link className="smart-link" to={link} variant="brand">
          <MetabotSmartLinkComponent model={model} entityId={entityId} />
        </Link>
      );
    }

    if (href && href.startsWith("/")) {
      // A custom handler for internal links (use by Embedding SDK)
      if (onInternalLinkClick) {
        return (
          <a {...rest} onClick={() => onInternalLinkClick(href)}>
            {children}
          </a>
        );
      }

      return (
        <Link to={href} variant="brand">
          {children}
        </Link>
      );
    }

    // For external links, set target and rel explicitly
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    );
  },
});

export const AIMarkdown = memo(
  ({ className, onInternalLinkClick, ...props }: AIMarkdownProps) => {
    const components = useMemo(
      () => getComponents({ onInternalLinkClick }),
      [onInternalLinkClick],
    );

    return (
      <Markdown
        className={cx(S.aiMarkdown, className)}
        components={components}
        {...props}
      />
    );
  },
);

AIMarkdown.displayName = "AIMarkdown";
