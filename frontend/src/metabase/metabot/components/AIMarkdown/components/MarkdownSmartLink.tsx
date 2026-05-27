import { match } from "ts-pattern";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import { useGetIcon } from "metabase/hooks/use-icon";
import type { MetabaseProtocolEntityModel } from "metabase/metabot/utils/links";
import { useEntityData } from "metabase/rich_text_editing/tiptap/extensions/SmartLink/SmartLinkNode";
import { entityToUrlableModel } from "metabase/rich_text_editing/tiptap/extensions/shared/suggestionUtils";
import { modelToUrl } from "metabase/urls";

import S from "../AIMarkdown.module.css";

import { InternalLink } from "./InternalLink";

export const MarkdownSmartLink = ({
  onInternalLinkClick,
  id,
  name,
  model,
}: {
  onInternalLinkClick?: (href: string) => void;
  id: number;
  name: string;
  model: MetabaseProtocolEntityModel | "data-point";
}) => {
  if (model === "data-point") {
    return <MarkdownDataPointSmartLink id={id} name={name} />;
  }

  return (
    <MarkdownEntitySmartLink
      onInternalLinkClick={onInternalLinkClick}
      id={id}
      name={name}
      model={model}
    />
  );
};

const MarkdownDataPointSmartLink = ({
  id,
  name,
}: {
  id: number;
  name: string;
}) => (
  <button
    type="button"
    className={S.smartLink}
    onClick={() => {
      window.dispatchEvent(
        new CustomEvent("metabot:data-point-mention-click", {
          detail: { id },
        }),
      );
    }}
  >
    <span className={S.smartLinkInner}>@{name}</span>
  </button>
);

const MarkdownEntitySmartLink = ({
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
    <InternalLink
      onInternalLinkClick={onInternalLinkClick}
      href={entityUrl}
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
};
