import type { MouseEventHandler } from "react";
import { match } from "ts-pattern";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import { useGetIcon } from "metabase/hooks/use-icon";
import type { MetabaseProtocolEntityModel } from "metabase/metabot/utils/links";
import { useEntityData } from "metabase/rich_text_editing/tiptap/extensions/SmartLink/SmartLinkNode";
import { entityToUrlableModel } from "metabase/rich_text_editing/tiptap/extensions/shared/suggestionUtils";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import { modelToUrl } from "metabase/urls";

import type { DataPointMentionTarget } from "../../MetabotChat/data-point-mentions";
import { routeDataPointMention } from "../../MetabotChat/data-point-router";
import S from "../AIMarkdown.module.css";

import { InternalLink } from "./InternalLink";

export const MarkdownSmartLink = ({
  onInternalLinkClick,
  onLinkClick,
  id,
  name,
  model,
  target,
  targets,
}: {
  onInternalLinkClick?: (href: string) => void;
  // Intercepts a click on an entity link (e.g. a question) so it can scroll to
  // a matching chart embedded in the same reply instead of opening a new tab.
  onLinkClick?: MouseEventHandler<HTMLAnchorElement>;
  id?: number | string;
  name: string;
  model: MetabaseProtocolEntityModel | "data-point" | "data-selection";
  target?: DataPointMentionTarget;
  targets?: DataPointMentionTarget[];
}) => {
  const getIcon = useGetIcon();

  const entityModel = match(model)
    .with("model", () => "dataset" as const)
    .with("question", () => "card" as const)
    .otherwise((x) => x);
  const queryModel: SuggestionModel | null =
    model === "data-point" || model === "data-selection"
      ? null
      : (entityModel as SuggestionModel);

  const { entity, isLoading, error } = useEntityData(
    model === "data-point" ||
      model === "data-selection" ||
      typeof id !== "number"
      ? null
      : id,
    queryModel,
  );

  if (model === "data-selection") {
    return (
      <button
        type="button"
        className={S.smartLink}
        onClick={() => {
          window.dispatchEvent(
            new CustomEvent("metabot:data-selection-mention-click", {
              detail: { id, targets },
            }),
          );
        }}
      >
        <span className={S.smartLinkInner}>{name}</span>
      </button>
    );
  }

  if (model === "data-point") {
    return (
      <button
        type="button"
        className={S.smartLink}
        onClick={() => {
          routeDataPointMention(target, id);
        }}
      >
        <span className={S.smartLinkInner}>{name}</span>
      </button>
    );
  }

  if (!queryModel) {
    return null;
  }

  const icon = getIcon({ model: queryModel });

  const entityUrl =
    !isLoading && !error && entity
      ? (modelToUrl(entityToUrlableModel(entity, queryModel)) ?? "")
      : ""; // fallback to linking to nothing

  return (
    <InternalLink
      onInternalLinkClick={onInternalLinkClick}
      onClick={onLinkClick}
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
