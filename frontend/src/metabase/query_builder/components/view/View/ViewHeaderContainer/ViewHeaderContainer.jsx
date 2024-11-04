/* eslint-disable react/prop-types */
import { ArchivedEntityBanner } from "metabase/archive/components/ArchivedEntityBanner";
import CS from "metabase/css/core/index.css";
import NewQuestionHeader from "metabase/query_builder/components/view/NewQuestionHeader";
import { Transition } from "metabase/ui";
import * as Lib from "metabase-lib";

import {
  BorderedViewTitleHeader,
  QueryBuilderViewHeaderContainer,
} from "./ViewHeaderContainer.styled";

const fadeIn = {
  in: { opacity: 1 },
  out: { opacity: 0 },
  transitionProperty: "opacity",
};
export const ViewHeaderContainer = props => {
  const { question, onUnarchive, onMove, onDeletePermanently } = props;
  const query = question.query();
  const card = question.card();
  const { isNative } = Lib.queryDisplayInfo(query);

  const isNewQuestion = !isNative && Lib.sourceTableOrCardId(query) === null;

  return (
    <QueryBuilderViewHeaderContainer>
      {card.archived && (
        <ArchivedEntityBanner
          name={card.name}
          entityType={card.type}
          canWrite={card.can_write}
          canRestore={card.can_restore}
          canDelete={card.can_delete}
          onUnarchive={() => onUnarchive(question)}
          onMove={collection => onMove(question, collection)}
          onDeletePermanently={() => onDeletePermanently(card.id)}
        />
      )}

      <BorderedViewTitleHeader
        {...props}
        style={{
          transition: "opacity 300ms linear",
          opacity: isNewQuestion ? 0 : 1,
        }}
      />
      {/*This is used so that the New Question Header is unmounted after the animation*/}
      <Transition mounted={isNewQuestion} transition={fadeIn} duration={300}>
        {style => <NewQuestionHeader className={CS.spread} style={style} />}
      </Transition>
    </QueryBuilderViewHeaderContainer>
  );
};
