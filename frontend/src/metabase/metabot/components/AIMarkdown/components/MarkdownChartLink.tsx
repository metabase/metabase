import { EntityIcon } from "metabase/common/components/EntityIcon";
import { useGetIcon } from "metabase/hooks/use-icon";
import type { CardDisplayType } from "metabase-types/api";

import S from "../AIMarkdown.module.css";

import { InternalLink } from "./InternalLink";

export const MarkdownChartLink = ({
  onInternalLinkClick,
  href,
  name,
  display,
}: {
  onInternalLinkClick?: (href: string) => void;
  href: string;
  name: string;
  display?: CardDisplayType;
}) => {
  const getIcon = useGetIcon();
  const icon = getIcon({ model: "card", display: display ?? "table" });

  return (
    <InternalLink
      onInternalLinkClick={onInternalLinkClick}
      href={href}
      target="_blank"
      rel="noreferrer"
      className={S.smartLink}
      data-testid="markdown-chart-link"
    >
      <span className={S.smartLinkInner}>
        <EntityIcon {...icon} className={S.icon} />
        {name}
      </span>
    </InternalLink>
  );
};
