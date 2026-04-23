import { match } from "ts-pattern";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import { useGetIcon } from "metabase/hooks/use-icon";
import type { MetabaseProtocolEntityModel } from "metabase/metabot/utils/links";
import { useEntityData } from "metabase/rich_text_editing/tiptap/extensions/SmartLink/SmartLinkNode";
import { entityToUrlableModel } from "metabase/rich_text_editing/tiptap/extensions/shared/suggestionUtils";
import { modelToUrl } from "metabase/utils/urls";

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
