import React from "react";
import { t } from "ttag";
import { Container, ContentWrapper, Title } from "./PivotDrillPopover.styled";

interface Props {
  children: React.ReactNode;
}
const PivotDrillPopover = ({ children }: Props): JSX.Element => {
  return (
    <Container>
      <Title>{t`Break out by…`}</Title>
      <ContentWrapper>{children}</ContentWrapper>
    </Container>
  );
};

export default PivotDrillPopover;
