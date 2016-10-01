import { suggestDifferentTimeGranularity } from "metabase/lib/recommenders/table_based/change_granularity";
import { suggestDifferentTimeExtract } from "metabase/lib/recommenders/table_based/change_time_extract";
import { suggestTableSegments } from "metabase/lib/recommenders/table_based/filter_by_segment";
import { suggestTableMetrics } from "metabase/lib/recommenders/table_based/metrics";
import { suggestUnderlyingData } from "metabase/lib/recommenders/table_based/underlying_data";
import { suggestCountByTime, 
		 suggestCountByGeo, 
		 suggestCountByCategory, 
		 suggestCountDistinctOfEntityKeys } from "metabase/lib/recommenders/table_based/common_aggregations";

export var TableBasedRecommenders = [{recommender: suggestUnderlyingData, base_weight: 100},
									 {recommender: suggestDifferentTimeGranularity, base_weight: 50},
									 {recommender: suggestDifferentTimeExtract, base_weight: 50},
									 {recommender: suggestTableSegments, base_weight: 70},
									 {recommender: suggestTableMetrics, base_weight: 70},
									 {recommender: suggestCountByTime, base_weight: 80},
		 							 {recommender: suggestCountByGeo, base_weight: 80},
									 {recommender: suggestCountByCategory, base_weight: 80},
		 						   	 {recommender: suggestCountDistinctOfEntityKeys, base_weight: 60}
									 ]
