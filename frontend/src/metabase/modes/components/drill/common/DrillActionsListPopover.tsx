import React from "react";
import {
  Container,
  ContentWrapper,
  Title,
} from "./DrillActionsListPopover.styled";

interface Props {
  title: string;
  children: React.ReactNode;
}
const DrillActionsListPopover = ({ title, children }: Props): JSX.Element => {
  return (
    <Container>
      <Title>{title}</Title>
      <ContentWrapper>{children}</ContentWrapper>
    </Container>
  );
};

export default DrillActionsListPopover;
