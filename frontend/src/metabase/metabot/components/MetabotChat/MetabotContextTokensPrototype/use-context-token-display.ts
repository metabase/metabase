// PROTOTYPE: metabot context tokens
import { match } from "ts-pattern";
import { t } from "ttag";

import type { IconData } from "metabase/common/utils/icon";
import { useGetIcon } from "metabase/hooks/use-icon";
import { useEntityData } from "metabase/rich_text_editing/tiptap/extensions/SmartLink/use-entity-data";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import { getName } from "metabase/utils/name";

import type { ContextToken } from "./tokens";

export type ContextTokenDisplay = {
  name: string;
  typeLabel: string;
  collectionName?: string;
  icon: IconData;
};

const getTypeLabel = (model: SuggestionModel, isUnsaved: boolean) =>
  match(model)
    .with("card", () => (isUnsaved ? t`Unsaved question` : t`Question`))
    .with("dataset", () => t`Model`)
    .with("metric", () => t`Metric`)
    .with("dashboard", () => t`Dashboard`)
    .with("document", () => t`Document`)
    .with("table", () => t`Table`)
    .with("collection", () => t`Collection`)
    .with("database", () => t`Database`)
    .with("transform", () => t`Transform`)
    .with("measure", () => t`Measure`)
    .with("segment", () => t`Segment`)
    .otherwise(() => t`Item`);

export function useContextTokenDisplay(
  token: ContextToken,
): ContextTokenDisplay {
  const getIcon = useGetIcon();
  const { entity } = useEntityData(token.id, token.model);

  const display =
    entity && "display" in entity ? entity.display : token.display;
  const collection =
    entity && "collection" in entity ? entity.collection : undefined;

  return {
    name: entity ? getName(entity) : (token.label ?? t`Loading…`),
    typeLabel: getTypeLabel(token.model, token.id == null),
    collectionName: collection?.name,
    icon: getIcon({ model: token.model, display }),
  };
}
