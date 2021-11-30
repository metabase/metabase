import Databases from "metabase/entities/databases";
import OurDataSection from "../../components/OurDataSection";

export default Databases.loadList()(OurDataSection);
