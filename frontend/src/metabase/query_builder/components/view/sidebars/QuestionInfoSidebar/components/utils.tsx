import { match } from "ts-pattern";

import { getTableUrl } from "metabase/browse/containers/TableBrowser/TableBrowser";
import { getIcon } from "metabase/lib/icon";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getMetadata } from "metabase/selectors/metadata";
import type { IconProps } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { TableId } from "metabase-types/api";

export interface QuestionSource {
  url: string;
  name: string;
  iconProps: Omit<IconProps, "display">;
}

export const useQuestionSourcesInfo = (
  question: Question,
): QuestionSource[] => {
  /** This might be a table or the underlying question that the presently viewed question is based on */
  const sourceInfo = question.legacyQueryTable();

  const metadata = useSelector(getMetadata);

  if (!sourceInfo) {
    return [];
  }

  const sourceModel = String(sourceInfo.id).includes("card__")
    ? "card"
    : "table";

  const sourceUrl = getSourceUrl({ model: sourceModel, sourceInfo, metadata });

  const modelForIcon = match({
    model: sourceModel,
    type: "type" in sourceInfo ? sourceInfo.type : null,
  })
    .with({ type: "question" }, () => ({ model: "card" as const }))
    .with({ type: "model" }, () => ({ model: "dataset" as const }))
    .otherwise(() => ({ model: "table" as const }));

  const iconProps = getIcon(modelForIcon);

  const sources = [];
  if (sourceInfo.db) {
    sources.push({
      url: Urls.browseDatabase(sourceInfo.db),
      name: sourceInfo.db.name,
      iconProps: { name: "database" as const },
    });
  }
  sources.push({ url: sourceUrl, name: sourceInfo.display_name, iconProps });
  return sources;
};

export const getSourceUrl = ({
  model,
  sourceInfo,
  metadata,
}: {
  model: string;
  sourceInfo: { db?: Database; id: TableId };
  metadata: Metadata;
}) => {
  if (model === "card") {
    const questionInfo = sourceInfo;
    const questionId = Number(`${questionInfo.id}`.split("__")[1]);
    return Urls.question({
      ...questionInfo,
      id: questionId,
    });
  } else {
    return getTableUrl(sourceInfo, metadata);
  }
};
