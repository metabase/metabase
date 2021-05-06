import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Revision from "metabase/entities/revisions";
import Timeline from "metabase/components/Timeline";

_QuestionActivityTimeline.propTypes = {
  question: PropTypes.object,
  className: PropTypes.string,
  revisions: PropTypes.array,
  canRevert: PropTypes.bool,
};

function _QuestionActivityTimeline({
  question,
  className,
  revisions,
  canRevert,
}) {
  const items = [
    {
      icon: "verified",
      title: "John Someone verified this",
      description: "idk lol",
      timestamp: Date.now(),
      numComments: 5,
    },
    {
      icon: "pencil",
      title: "Foo edited this",
      description: "Did a thing.",
      timestamp: Date.now(),
    },
    {
      icon: "warning_colorized",
      title: "Someone McSomeone thinks something looks wrong",
      description:
        "Uh oh that's not correct. Uh oh that's not correct. Uh oh that's not correct. Uh oh that's not correct. Uh oh that's not correct. Uh oh that's not correct. Uh oh that's not correct. Uh oh that's not correct. Uh oh that's not correct. \nUh oh that's not correct. \nUh oh that's not correct. \nUh oh that's not correct. \nUh oh that's not correct. \nUh oh that's not correct. \nUh oh that's not correct. \nUh oh that's not correct. \nUh oh that's not correct. \nUh oh that's not correct. Uh oh that's not correct. Uh oh that's not correct. Uh oh that's not correct. Uh oh that's not",
      timestamp: Date.now(),
    },
    {
      icon: "clarification",
      title: "Someone is confused",
      description:
        "Something something something something something something something something something something something something?",
      timestamp: Date.now(),
      numComments: 123,
    },
  ];

  return (
    <div className={className}>
      <div className="text-medium text-bold pb2">{t`Activity`}</div>
      <Timeline items={items} />
    </div>
  );
}

export const QuestionActivityTimeline = Revision.loadList({
  query: (state, props) => ({
    model_type: "card",
    model_id: props.question.id(),
  }),
  wrapped: true, // what does this do
})(_QuestionActivityTimeline);
