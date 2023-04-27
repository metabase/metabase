import { connect } from "react-redux";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import Search from "metabase/entities/search";
import { openNavbar } from "metabase/redux/app";
import { getSetting } from "metabase/selectors/settings";
import { CollectionItem } from "metabase-types/api";
import { State } from "metabase-types/store";
import { canUseMetabotOnDatabase } from "metabase/metabot/utils";
import Database from "metabase-lib/metadata/Database";
import HomePage from "../../components/HomePage";

interface EntityLoaderProps {
  databases: Database[];
  models: CollectionItem[];
}

interface StateProps {
  hasMetabot: boolean;
  homepageDashboard: number | null;
}

const mapStateToProps = (
  state: State,
  { databases, models }: EntityLoaderProps,
): StateProps => {
  const hasModels = models.length > 0;
  const hasSupportedDatabases = databases.some(canUseMetabotOnDatabase);
  const isMetabotEnabled = getSetting(state, "is-metabot-enabled");

  const hasCustomHomepage = getSetting(state, "custom-homepage");

  return {
    hasMetabot: hasModels && hasSupportedDatabases && isMetabotEnabled,
    homepageDashboard: hasCustomHomepage
      ? getSetting(state, "custom-homepage-dashboard")
      : null,
  };
};

const mapDispatchToProps = {
  onOpenNavbar: openNavbar,
};

export default _.compose(
  Databases.loadList(),
  Search.loadList({
    query: {
      models: "dataset",
      limit: 1,
    },
    listName: "models",
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(HomePage);
