import { match } from "ts-pattern";

import { getIcon } from "metabase/lib/icon";
import { modelToUrl } from "metabase/lib/urls";
import { Icon } from "metabase/ui";
import type { MetabaseProtocolEntityModel } from "metabase-enterprise/metabot/utils/links";
import { useEntityData } from "metabase-enterprise/rich_text_editing/tiptap/extensions/SmartLink/SmartLinkNode";
import { entityToUrlableModel } from "metabase-enterprise/rich_text_editing/tiptap/extensions/shared/suggestionUtils";

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
        <Icon name={icon.name} className={S.icon} />
        {name}
      </span>
    </InternalLink>
  );
};
