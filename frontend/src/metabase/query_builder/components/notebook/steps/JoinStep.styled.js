import styled from "styled-components";

export const JoinClausesContainer = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 0 auto;
`;

export const JoinClauseContainer = styled.div`
  margin-bottom: ${props => (props.isLast ? 0 : "2px")};
`;

export const JoinClauseRoot = styled.div`
  display: flex;
  align-items: center;
  flex: 1 1 auto;
`;
