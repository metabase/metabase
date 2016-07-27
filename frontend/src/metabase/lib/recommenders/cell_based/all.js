import { suggestObjectDetailView } from "metabase/lib/recommenders/cell_based/primary_key_object_detail";
import { suggestDashboardParameterizedByID, suggestCardParameterizedByID } from "metabase/lib/recommenders/cell_based/primary_key_as_parameter";


export var cellBasedRecommenders = {[recommender: suggestObjectDetailView, base_weight: 70], 
									[recommender: suggestDashboardParameterizedByID, base_weight: 80], 
									[recommender: suggestCardParameterizedByID, base_weight: 70]}

