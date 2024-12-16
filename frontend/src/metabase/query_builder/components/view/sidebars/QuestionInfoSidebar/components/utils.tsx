import { match } from "ts-pattern";

import { type IconData, type IconModel, getIcon } from "metabase/lib/icon";

import type { QuestionSource } from "./types";

export const getIconPropsForSource = (
  source: QuestionSource,
): IconData | undefined => {
  const iconModel: IconModel | undefined = match(source.model)
    .with("question", () => "card" as const)
    .with("model", () => "dataset" as const)
    .with("database", () => "database" as const)

    .with("metric", () => "metric" as const)
    .with("schema", () => undefined)
    .otherwise(() => "table" as const);

  const iconProps = iconModel ? getIcon({ model: iconModel }) : undefined;
  return iconProps;
};
