import {
  getOriginalQuestion,
  getQuestion,
} from "metabase/query_builder/selectors";
import type { State } from "metabase/redux/store";
import { connect } from "metabase/utils/redux";

import QuestionLineage from "../../components/QuestionLineage";

const mapStateToProps = (state: State) => ({
  question: getQuestion(state),
  originalQuestion: getOriginalQuestion(state),
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(QuestionLineage);
