import { recommendUnderlyingData } from "metabase/lib/recommenders/table_based/underlying_data";
import { suggestDifferentTimeGranularity } from "metabase/lib/recommenders/table_based/change_granularity";
import { suggestDifferentTimeExtract } from "metabase/lib/recommenders/table_based/change_time_extract";
import { suggestTableSegments } from "metabase/lib/recommenders/table_based/filter_by_segment";

export var TableBasedRecommenders = [{recommender: recommendUnderlyingData, base_weight: 100},
									 {recommender: suggestDifferentTimeGranularity, base_weight: 50},
									 {recommender: suggestDifferentTimeExtract, base_weight: 50},
									 {recommender: suggestTableSegments, base_weight: 70}]
