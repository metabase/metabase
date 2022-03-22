import React from "react";
import { t } from "ttag";

import Subhead from "metabase/components/type/Subhead";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

import QuestionDataSelector from "../../QuestionDataSelector";

type Props = {
  query: StructuredQuery;
  fitClassNames: string;
};

function NewQuestionView({ query, fitClassNames }: Props) {
  return (
    <div className={fitClassNames}>
      <div className="p4 mx2">
        <QuestionDataSelector
          query={query}
          triggerElement={
            <Subhead className="mb2">{t`Pick your data`}</Subhead>
          }
        />
      </div>
    </div>
  );
}

export default NewQuestionView;
