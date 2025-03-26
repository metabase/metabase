import { useEffect, useMemo, useState } from "react";
import { useAsyncFn } from "react-use";

import { useListRecentsQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { CardApi } from "metabase/services";
import { Loader } from "metabase/ui";
import { getUsedDataSources } from "metabase/visualizer/selectors";
import { createDataSource, parseDataSourceId } from "metabase/visualizer/utils";
import type { GetCompatibleCardsPayload } from "metabase-types/api";
import type {
  VisualizerDataSource,
  VisualizerDataSourceId,
} from "metabase-types/store/visualizer";

import { ResultsList, type ResultsListProps } from "./ResultsList";

interface RecentsListProps {
  onSelect: ResultsListProps["onSelect"];
  dataSourceIds: Set<VisualizerDataSourceId>;
}

export function RecentsList({ onSelect, dataSourceIds }: RecentsListProps) {
  const { data: allRecents = [] } = useListRecentsQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });

  const [items, setItems] = useState<VisualizerDataSource[]>([]);

  const datasources = useSelector(getUsedDataSources);

  const [{ error, loading }, loadCards] = useAsyncFn(async () => {
    const payload: GetCompatibleCardsPayload = {
      limit: 50,
      exclude_ids: [],
    };

    const { sourceId } = parseDataSourceId(datasources[0].id);

    //We want to ensure that we don't allow combining cards from other dashboards with this one
    const cards = await CardApi.compatibleCards({
      ...payload,
      cardId: sourceId,
    });

    setItems([
      datasources[0],
      ...cards.map((card: any) => createDataSource("card", card.id, card.name)),
    ]);
  }, [datasources]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  const all = useMemo(() => {
    return allRecents
      .filter(maybeCard =>
        ["card", "dataset", "metric"].includes(maybeCard.model),
      )
      .map(card => createDataSource("card", card.id, card.name));
  }, [allRecents]);

  if (!items || loading || !all) {
    return <Loader />;
  }

  return (
    <ResultsList
      items={items && items.length ? items : all}
      onSelect={onSelect}
      dataSourceIds={dataSourceIds}
    />
  );
}
