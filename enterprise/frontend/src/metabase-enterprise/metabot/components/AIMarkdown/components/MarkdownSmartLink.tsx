import { type IconModel, getIcon } from "metabase/lib/icon";
import { modelToUrl } from "metabase/lib/urls";
import { Icon } from "metabase/ui";
import type { SuggestionModel } from "metabase-enterprise/documents/components/Editor/types";
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
  model: IconModel & SuggestionModel;
}) => {
  const { entity, isLoading, error } = useEntityData(id, model);
  const entityUrl =
    !isLoading && !error && entity
      ? (modelToUrl(entityToUrlableModel(entity, model)) ?? "")
      : "#";

  return (
    <InternalLink
      onInternalLinkClick={onInternalLinkClick}
      href={entityUrl}
      target="_blank"
      rel="noreferrer"
      className={S.smartLink}
    >
      <span className={S.smartLinkInner}>
        <Icon name={getIcon({ model }).name} className={S.icon} />
        {name}
      </span>
    </InternalLink>
  );
};
