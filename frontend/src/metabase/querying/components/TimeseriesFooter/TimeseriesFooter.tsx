import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/Question";
import { TimeseriesControls } from "./TimeseriesControls";

const STAGE_INDEX = -1;

interface TimeseriesFooterProps {
  question: Question;
  updateQuestion: (newQuestion: Question) => void;
}

export function TimeseriesFooter({
  question,
  updateQuestion,
}: TimeseriesFooterProps) {
  const query = question._getMLv2Query();

  const handleChange = (query: Lib.Query) => {
    updateQuestion(question._setMLv2Query(query));
  };

  return (
    <TimeseriesControls
      query={query}
      stageIndex={STAGE_INDEX}
      onChange={handleChange}
    />
  );
}
