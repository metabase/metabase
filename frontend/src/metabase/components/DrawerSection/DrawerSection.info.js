import React from "react";
import DrawerSection from "./DrawerSection";

import moment from "moment";
import styled from "@emotion/styled";
import Timeline from "metabase/components/Timeline";
import { color } from "metabase/lib/colors";

export const component = DrawerSection;
export const category = "layout";
export const description = `
  This component is similar to the CollapseSection component,
  but instead of expanding downward, it expands upward.
  The header situates itself at the bottom of the remaining space
  in a parent component and when opened fills the remaining space
  with what child components you have given it.

  For this to work properly, the containing element (here, Container)
  must handle overflow when the DrawerSection is open and have a display
  of "flex" (plus a flex-direction of "column") so that the DrawerSection
  can properly use the remaining space in the Container component.
`;

const Container = styled.div`
  line-height: 1.5;
  width: 350px;
  border: 1px dashed ${color("bg-dark")};
  border-radius: 0.5rem;
  padding: 1rem;
  height: 32rem;

  overflow-y: auto;
  display: flex;
  flex-direction: column;
`;

const TextArea = styled.textarea`
  width: 100%;
  flex-shrink: 0;
`;

const items = [
  {
    icon: "verified",
    title: "John Someone verified this",
    description: "idk lol",
    timestamp: moment().subtract(1, "day").valueOf(),
    numComments: 5,
  },
  {
    icon: "pencil",
    title: "Foo edited this",
    description: "Did a thing.",
    timestamp: moment().subtract(1, "week").valueOf(),
  },
  {
    icon: "close",
    title: "foo foo foo",
    timestamp: moment().subtract(2, "month").valueOf(),
  },
  {
    icon: "number",
    title: "bar bar bar",
    timestamp: moment().subtract(1, "year").valueOf(),
    numComments: 123,
  },
];

export const examples = {
  "Constrained container": (
    <Container>
      <TextArea placeholder="an element with variable height" />
      <DrawerSection header="foo">
        <Timeline items={items} />
      </DrawerSection>
    </Container>
  ),
};
