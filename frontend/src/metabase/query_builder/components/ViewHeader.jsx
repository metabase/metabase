import React from "react";
import { Flex } from "grid-styled";
import { t } from "c-3po";
import { color } from "styled-system";
import styled from "styled-components";

import colors, { lighten } from "metabase/lib/colors";

import Button from "metabase/components/Button";

import QueryDefinition from "metabase/query_builder/components/QueryDefinition";

const RoundButton = styled(Button)`
  border-radius: 99px;
  border: none;
  &:hover {
    background-color: ${lighten(colors["brand"], 0.4)} !important;
    transition: background-color 300ms linear;
  }
`;

RoundButton.defaultProps = {
  mx: 1,
};
const HeaderButton = styled(Button)`
  background-color: ${lighten(colors["brand"], 0.6)} !important;
  color: ${colors["brand"]};
  text-transform: uppercase;
  border: none;
  font-weight: 900;
  &:hover {
    background-color: ${lighten(colors["brand"], 0.4)} !important;
    transition: background-color 300ms linear;
  }
`;

const Title = styled("h2")`
  ${color} font-weight: 900;
`;

const ViewHeader = ({ question, setMode, mode }) => (
  <Flex
    align="center"
    className="full relative py2 px4 border-bottom bg-white flex"
  >
    <span className="z3" />
    <Title color={question.displayName() ? "inherit" : colors["text-light"]}>
      {question.displayName() || t`Untitled question`}
    </Title>
    <Flex ml={1}>
      <HeaderButton
        onClick={() => alert("Save me")}
        p={1}
        mr={1}
      >{t`Save`}</HeaderButton>
      <HeaderButton
        onClick={() => alert("More")}
        p={1}
        icon="ellipsis"
        iconSize={22}
      />
    </Flex>
    <div className="absolute bottom left right flex z2" style={{ bottom: -18 }}>
      <div
        className="bordered rounded px2 shadowed flex align-center ml-auto mr-auto bg-white p1 cursor-pointer text-light text-bold"
        style={{ borderRadius: 99 }}
      >
        <QueryDefinition question={question} />
        <RoundButton
          iconColor={
            mode === "worksheet" ? colors["brand"] : colors["text-medium"]
          }
          icon="pencil"
          onClick={() => setMode("worksheet")}
        />
        <RoundButton
          iconColor={
            mode === "visualize" ? colors["brand"] : colors["text-medium"]
          }
          icon="area"
          onClick={() => setMode("visualize")}
        />
        <RoundButton
          iconColor={
            mode === "present" ? colors["brand"] : colors["text-medium"]
          }
          icon="star"
          onClick={() => setMode("present")}
        />
      </div>
    </div>
  </Flex>
);

export default ViewHeader;
