import { connect } from "react-redux";
import DatabaseHelpCard from "metabase/components/DatabaseHelpCard";
import { getSetting } from "metabase/selectors/settings";
import type { State } from "metabase-types/store";

export interface DatabaseHelpCardProps {
  className?: string;
}

interface DatabaseHelpCardStateProps {
  isHosted: boolean;
}

const mapStateToProps = (state: State): DatabaseHelpCardStateProps => ({
  isHosted: getSetting(state, "is-hosted?"),
});

export default connect<
  DatabaseHelpCardStateProps,
  unknown,
  DatabaseHelpCardProps,
  State
>(mapStateToProps)(DatabaseHelpCard);
