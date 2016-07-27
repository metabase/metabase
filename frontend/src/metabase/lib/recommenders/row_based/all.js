import { suggestObjectDetailView } from "metabase/lib/recommenders/row_based/primary_key_object_detail";
import { suggestDashboardParameterizedByID, suggestCardParameterizedByID } from "metabase/lib/recommenders/row_based/primary_key_as_parameter";


export var RowBasedRecommenders = [{recommender: suggestObjectDetailView, base_weight: 50}, 
									{recommender: suggestDashboardParameterizedByID, base_weight: 50}, 
									{recommender: suggestCardParameterizedByID, base_weight: 40}]

