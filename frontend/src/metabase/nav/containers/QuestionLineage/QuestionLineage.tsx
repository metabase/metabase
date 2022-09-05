import { connect } from "react-redux";
import {
  getOriginalQuestion,
  getQuestion,
} from "metabase/query_builder/selectors";
import { State } from "metabase-types/store";
import QuestionLineage from "../../components/QuestionLineage";

const mapStateToProps = (state: State) => ({
  question: getQuestion(state),
  originalQuestion: getOriginalQuestion(state),
});

export default connect(mapStateToProps)(QuestionLineage);
