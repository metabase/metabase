import PopularItems from "metabase/entities/popular-items";
import HomePopularSection from "../../components/HomePopularSection";

export default PopularItems.loadList()(HomePopularSection);
