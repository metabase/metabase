import { match } from "ts-pattern";

import { type IconData, type IconModel, getIcon } from "metabase/lib/icon";
import { getUrl } from "metabase/querying/notebook/components/NotebookDataPicker/utils";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

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

export const getJoinedTablesWithIcons = (question: Question) => {
  const query = question?.query();

  const stageIndexes = Lib.stageIndexes(query);

  const joinedTables = stageIndexes.flatMap(stageIndex => {
    const joins = Lib.joins(query, stageIndex);

    const joinedThings = joins.map(join => {
      const thing = Lib.joinedThing(query, join);
      const url = getUrl({ query, table: thing, stageIndex }) as string;
      const { displayName } = Lib.displayInfo(query, stageIndex, thing);
      return { name: displayName, href: url };
    });
    return joinedThings;
  });

  return joinedTables.map(source => ({
    ...source,
    iconProps: getIconPropsForSource(source),
  }));
};
