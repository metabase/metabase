import type { ComponentProps } from "react";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import { useGetIcon } from "metabase/hooks/use-icon";
import { MetabotHoverCard } from "metabase/metabot/components/MetabotHoverCard";
import { getConversationChart } from "metabase/metabot/state";
import { useSelector } from "metabase/redux";
import { EntitySmartLink } from "metabase/rich_text_editing/tiptap/extensions/SmartLink/EntitySmartLink";
import {
  type SmartLinkEntityRef,
  useSmartLinkEntity,
} from "metabase/rich_text_editing/tiptap/extensions/SmartLink/use-smart-link-entity";
import { conversationChartUrl } from "metabase/urls";

import S from "../AIMarkdown.module.css";

import { InternalLink } from "./InternalLink";

export type MarkdownSmartLinkTarget =
  | (SmartLinkEntityRef & { href?: string })
  | { id: string; model: "chart" };

type MarkdownSmartLinkProps = {
  onInternalLinkClick?: (href: string) => void;
  name: string;
} & MarkdownSmartLinkTarget;

export const MarkdownSmartLink = (props: MarkdownSmartLinkProps) =>
  props.model === "chart" ? (
    <ChartSmartLink {...props} />
  ) : (
    <EntityMention {...props} />
  );

const EntityMention = ({
  onInternalLinkClick,
  id,
  name,
  model,
  href,
}: SmartLinkEntityRef & {
  onInternalLinkClick?: (href: string) => void;
  name: string;
  href?: string;
}) => {
  const { libraryEntity } = useSmartLinkEntity({ id, model, href });

  return (
    <MetabotHoverCard entity={libraryEntity}>
      <EntitySmartLink
        id={id}
        model={model}
        name={name}
        href={href}
        onNavigate={onInternalLinkClick}
      />
    </MetabotHoverCard>
  );
};

const ChartSmartLink = ({
  onInternalLinkClick,
  id,
  name,
}: {
  onInternalLinkClick?: (href: string) => void;
  id: string;
  name: string;
  model: "chart";
}) => {
  const getIcon = useGetIcon();
  const chart = useSelector((state) => getConversationChart(state, id));
  const icon = getIcon({
    model: "card",
    display: chart?.visualization_settings?.chart_type ?? "table",
  });
  const href = chart ? conversationChartUrl(chart) : undefined;

  if (!href) {
    return (
      <span className={S.smartLink}>
        <SmartLinkChipContent icon={icon} name={name} />
      </span>
    );
  }

  return (
    <SmartLinkChip
      onInternalLinkClick={onInternalLinkClick}
      href={href}
      icon={icon}
      name={name}
    />
  );
};

const SmartLinkChipContent = ({
  icon,
  name,
}: {
  icon: ComponentProps<typeof EntityIcon>;
  name: string;
}) => (
  <span className={S.smartLinkInner}>
    <EntityIcon {...icon} className={S.icon} />
    {name}
  </span>
);

const SmartLinkChip = ({
  onInternalLinkClick,
  href,
  icon,
  name,
}: {
  onInternalLinkClick?: (href: string) => void;
  href: string;
  icon: ComponentProps<typeof EntityIcon>;
  name: string;
}) => (
  <InternalLink
    onInternalLinkClick={onInternalLinkClick}
    href={href}
    target="_blank"
    rel="noreferrer"
    className={S.smartLink}
  >
    <SmartLinkChipContent icon={icon} name={name} />
  </InternalLink>
);
