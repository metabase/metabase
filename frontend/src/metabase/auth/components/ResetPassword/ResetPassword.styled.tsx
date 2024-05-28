import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const InfoBody = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export const InfoTitle = styled.div`
  color: ${color("text-dark")};
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.5rem;
  text-align: center;
  margin-bottom: 1rem;
`;

export const InfoMessage = styled.div`
  color: ${color("text-dark")};
  text-align: center;
  margin-bottom: 2.5rem;
`;
