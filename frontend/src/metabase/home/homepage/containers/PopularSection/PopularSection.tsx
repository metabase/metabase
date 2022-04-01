import PopularViews from "metabase/entities/popular-views";
import PopularSection from "../../components/PopularSection";

export default PopularViews.loadList({ reload: true })(PopularSection);
