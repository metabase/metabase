import React from "react";
import moment from "moment";
import styled from "styled-components";

import Timeline from "metabase/components/Timeline";
import { color } from "metabase/lib/colors";

export const component = Timeline;
export const category = "display";

export const description = `
A component for showing events in descending order.
`;

const Container = styled.div`
  line-height: 1.5;
  width: 350px;
  border: 1px dashed ${color("bg-dark")};
  border-radius: 0.5rem;
  padding: 1rem;
`;

const items = [
  {
    icon: "verified",
    title: "John Someone verified this",
    description: "idk lol",
    timestamp: moment()
      .subtract(1, "day")
      .valueOf(),
    numComments: 5,
  },
  {
    icon: "pencil",
    title: "Foo edited this",
    description: "Did a thing.",
    timestamp: moment()
      .subtract(1, "week")
      .valueOf(),
  },
  {
    icon: "warning_colorized",
    title: "Someone McSomeone thinks something looks wrong",
    description:
      "Uh oh that's not correct. Uh oh that's not correct. Uh oh that's not correct. Uh oh that's not correct. Uh oh that's not correct. Uh oh that's not correct. Uh oh that's not correct. Uh oh that's not correct. Uh oh that's not correct. \nUh oh that's not correct. \nUh oh that's not correct. \nUh oh that's not correct. \nUh oh that's not correct. \nUh oh that's not correct. \nUh oh that's not correct. \nUh oh that's not correct. \nUh oh that's not correct. \nUh oh that's not correct. Uh oh that's not correct. Uh oh that's not correct. Uh oh that's not correct. Uh oh that's not",
    timestamp: moment()
      .subtract(2, "month")
      .valueOf(),
  },
  {
    icon: "clarification",
    title: "Someone is confused",
    description:
      "Something something something something something something something something something something something something?",
    timestamp: moment()
      .subtract(1, "year")
      .valueOf(),
    numComments: 123,
  },
];

function renderFooter(item) {
  return item.numComments ? (
    <a
      href="/_internal/components/timeline"
      className="text-underline"
    >{`${item.numComments} comments`}</a>
  ) : (
    ""
  );
}

export const examples = {
  "Constrained width": (
    <Container>
      <Timeline items={items} />
    </Container>
  ),
  "Optional footer": <Timeline items={items} renderFooter={renderFooter} />,
};
