// TODO: consolidate this component w/ AIAnalysisContent

import cx from "classnames";
import {
  Children,
  type ComponentPropsWithoutRef,
  type ReactNode,
  isValidElement,
  memo,
  useMemo,
} from "react";
import { t } from "ttag";

import { parseMetabaseProtocolLink } from "metabase/metabot/utils/links";
import { ActionIcon, CopyButton, Icon, Tooltip } from "metabase/ui";

import S from "./AIMarkdown.module.css";
import { StreamingMarkdown } from "./StreamingMarkdown";
import { InternalLink } from "./components/InternalLink";
import { MarkdownSmartLink } from "./components/MarkdownSmartLink";

type AIMarkdownProps = {
  children: string;
  className?: string;
  isStreaming?: boolean;
  animateFromStart?: boolean;
  onInternalLinkClick?: (link: string) => void;
  singleNewlinesAreParagraphs?: boolean;
};

const splitMessageLinesAsParagraphs = (message: string) =>
  message.replaceAll(/\r?\n|\r/g, "\n\n");

const getNodeText = (node: ReactNode): string =>
  Children.toArray(node)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child);
      }

      if (isValidElement<{ children?: ReactNode }>(child)) {
        return getNodeText(child.props.children);
      }

      return "";
    })
    .join("");

const MarkdownCodeBlock = ({
  children,
  ...props
}: ComponentPropsWithoutRef<"pre">) => {
  const code = getNodeText(children);

  return (
    <div className={S.codeBlock}>
      <pre {...props}>{children}</pre>
      <CopyButton value={code}>
        {({ copied, copy }: { copied: boolean; copy: () => void }) => (
          <Tooltip
            label={copied ? t`Copied!` : t`Copy code`}
            opened={copied || undefined}
          >
            <ActionIcon
              aria-label={t`Copy code`}
              className={S.copyCodeButton}
              data-testid="metabot-code-block-copy"
              size="sm"
              onClick={copy}
            >
              <Icon name="copy" size="1rem" />
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </div>
  );
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
    const parsed = parseMetabaseProtocolLink(node.properties.href);
    if (parsed) {
      return (
        <MarkdownSmartLink
          onInternalLinkClick={onInternalLinkClick}
          name={String(node.children?.[0]?.value ?? "")}
          {...parsed}
        />
      );
    }

    if (href?.startsWith("/")) {
      return (
        <InternalLink onInternalLinkClick={onInternalLinkClick} href={href}>
          {children}
        </InternalLink>
      );
    }

    // For external links, set target and rel explicitly
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    );
  },
  table: ({ children, ...props }: ComponentPropsWithoutRef<"table">) => (
    <div className={S.tableWrapper}>
      <div className={S.tableContainer}>
        <table {...props}>{children}</table>
      </div>
    </div>
  ),
  pre: MarkdownCodeBlock,
});

export const AIMarkdown = memo(
  ({
    className,
    onInternalLinkClick,
    children,
    isStreaming = false,
    animateFromStart = false,
    singleNewlinesAreParagraphs = false,
  }: AIMarkdownProps) => {
    const components = useMemo(
      () => getComponents({ onInternalLinkClick }),
      [onInternalLinkClick],
    );

    const source = singleNewlinesAreParagraphs
      ? splitMessageLinesAsParagraphs(children)
      : children;

    return (
      <div className={cx(S.aiMarkdownRoot, className)}>
        <StreamingMarkdown
          blockClassName={S.aiMarkdown}
          components={components}
          isStreaming={isStreaming}
          animateFromStart={animateFromStart}
          source={source}
        />
      </div>
    );
  },
);

AIMarkdown.displayName = "AIMarkdown";
