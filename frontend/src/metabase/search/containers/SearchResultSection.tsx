import type { WrappedResult } from "metabase/search/types";
import Card from "metabase/components/Card";
import { SearchResult } from "metabase/search/components/SearchResult";

export const SearchResultSection = ({ items }: { items: WrappedResult[] }) => (
  <Card className="pt2">
    {items.map(item => {
      return <SearchResult key={`${item.id}__${item.model}`} result={item} />;
    })}
  </Card>
);
