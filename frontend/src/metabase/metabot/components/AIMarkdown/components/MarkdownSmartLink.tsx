import type { ComponentProps } from "react";
import { match } from "ts-pattern";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import { useGetIcon } from "metabase/hooks/use-icon";
import { getConversationChart } from "metabase/metabot/state";
import {
  type MetabaseProtocolEntityModel,
  type ParsedMetabaseProtocolLink,
  conversationChartUrl,
} from "metabase/metabot/utils/links";
import { useSelector } from "metabase/redux";
import { useEntityData } from "metabase/rich_text_editing/tiptap/extensions/SmartLink/SmartLinkNode";
import { entityToUrlableModel } from "metabase/rich_text_editing/tiptap/extensions/shared/suggestionUtils";
import { modelToUrl } from "metabase/urls";

import S from "../AIMarkdown.module.css";

import { InternalLink } from "./InternalLink";

type MarkdownSmartLinkProps = {
  onInternalLinkClick?: (href: string) => void;
  name: string;
} & ParsedMetabaseProtocolLink;

export const MarkdownSmartLink = (props: MarkdownSmartLinkProps) =>
  props.model === "chart" ? (
    <ChartSmartLink {...props} />
  ) : (
    <EntitySmartLink {...props} />
  );

const EntitySmartLink = ({
  onInternalLinkClick,
  id,
  name,
  model,
}: {
  onInternalLinkClick?: (href: string) => void;
  id: number;
  name: string;
  model: MetabaseProtocolEntityModel;
}) => {
  const getIcon = useGetIcon();
  const entityModel = match(model)
    .with("model", () => "dataset" as const)
    .with("question", () => "card" as const)
    .otherwise((x) => x);
  const icon = getIcon({ model: entityModel });

  const { entity, isLoading, error } = useEntityData(id, entityModel);

  const entityUrl =
    !isLoading && !error && entity
      ? (modelToUrl(entityToUrlableModel(entity, entityModel)) ?? "")
      : ""; // fallback to linking to nothing

  return (
    <SmartLinkChip
      onInternalLinkClick={onInternalLinkClick}
      href={entityUrl}
      icon={icon}
      name={name}
    />
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
  const href = (chart && conversationChartUrl(chart)) ?? "";

  return (
    <SmartLinkChip
      onInternalLinkClick={onInternalLinkClick}
      href={href}
      icon={icon}
      name={name}
    />
  );
};

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
    <span className={S.smartLinkInner}>
      <EntityIcon {...icon} className={S.icon} />
      {name}
    </span>
  </InternalLink>
);
