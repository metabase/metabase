import React from "react";
import { Flex } from "grid-styled";
import { t } from "c-3po";
import { color } from "styled-system";
import styled from "styled-components";

import colors, { lighten } from "metabase/lib/colors";

import Button from "metabase/components/Button";

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

const Title = styled("h1")`
  ${color} font-weight: 900;
`;

const ViewHeader = ({ question }) => (
  <Flex align="center">
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
  </Flex>
);

export default ViewHeader;
