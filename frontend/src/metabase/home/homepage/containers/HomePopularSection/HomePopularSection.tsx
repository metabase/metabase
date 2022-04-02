import PopularViews from "metabase/entities/popular-views";
import HomePopularSection from "../../components/HomePopularSection";

export default PopularViews.loadList({ reload: true })(HomePopularSection);
