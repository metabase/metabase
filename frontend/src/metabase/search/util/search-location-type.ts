import { Location } from "history";
import { SearchFilters } from "metabase/search/util/filter-types";

export type SearchAwareLocation = Location<{ q?: string } & SearchFilters>;
