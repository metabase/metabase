import { connect } from "react-redux";
import _ from "underscore";
import Search from "metabase/entities/search";
import { openNavbar } from "metabase/redux/app";
import { getSetting } from "metabase/selectors/settings";
import { CollectionItem } from "metabase-types/api";
import { State } from "metabase-types/store";
import Database from "metabase-lib/metadata/Database";
import HomePage from "../../components/HomePage";

interface EntityLoaderProps {
  databases: Database[];
  models: CollectionItem[];
}

interface StateProps {
  hasMetabot: boolean;
}

const mapStateToProps = (
  state: State,
  { databases, models }: EntityLoaderProps,
): StateProps => {
  const hasModels = models.length > 0;
  const hasNativeWrite = databases.some(database => database.canWrite());
  const isMetabotEnabled = getSetting(state, "is-metabot-enabled");

  return {
    hasMetabot: hasModels && hasNativeWrite && isMetabotEnabled,
  };
};

const mapDispatchToProps = {
  onOpenNavbar: openNavbar,
};

export default _.compose(
  Search.loadList({
    query: {
      models: "dataset",
      limit: 1,
    },
    listName: "models",
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(HomePage);
