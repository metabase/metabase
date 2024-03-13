import styled from "@emotion/styled";

export const TimePickerRoot = styled.div`
  padding: 1rem;
`;

export const BetweenConnector = styled.span`
  margin-inline-end: 1.5rem;
  margin-inline-start: 1rem;
  font-weight: 700;
`;

export const MultiTimePickerRoot = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  flex-wrap: wrap;

  & > * {
    margin-bottom: 1rem;
  }
`;
