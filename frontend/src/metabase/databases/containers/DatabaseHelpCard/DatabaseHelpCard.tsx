import { connect } from "react-redux";
import { getSetting } from "metabase/selectors/settings";
import type { State } from "metabase-types/store";
import DatabaseHelpCard from "../../components/DatabaseHelpCard";

export interface DatabaseHelpCardProps {
  className?: string;
}

interface DatabaseHelpCardStateProps {
  isHosted: boolean;
}

const mapStateToProps = (state: State): DatabaseHelpCardStateProps => ({
  isHosted: getSetting(state, "is-hosted?"),
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect<
  DatabaseHelpCardStateProps,
  unknown,
  DatabaseHelpCardProps,
  State
>(mapStateToProps)(DatabaseHelpCard);
