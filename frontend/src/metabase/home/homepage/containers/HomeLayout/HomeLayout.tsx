import { connect } from "react-redux";
import _ from "underscore";
import { getSetting } from "metabase/selectors/settings";
import Search from "metabase/entities/search";
import type { State } from "metabase-types/store";
import HomeLayout from "../../components/HomeLayout";

const mapStateToProps = (state: State) => ({
  showIllustration: getSetting(state, "show-lighthouse-illustration"),
  isMetabotEnabled: getSetting(state, "metabot-enabled"),
});

export default _.compose(
  Search.loadList({
    query: {
      models: "dataset",
      limit: 1,
    },
    listName: "models",
  }),
  connect(mapStateToProps),
)(HomeLayout);
