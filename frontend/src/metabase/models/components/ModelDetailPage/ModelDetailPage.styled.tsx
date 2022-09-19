import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const ModelMain = styled.div`
  display: flex;
  flex: 1;

  padding-right: 3rem;
`;

export const RootLayout = styled.div`
  display: flex;
  flex: 1;
  flex-direction: row;

  padding: 3rem 4rem;
  min-height: 90vh;
`;

export const ModelTitle = styled.h3`
  color: ${color("text-dark")};
  font-weight: 700;
  font-size: 1.25rem;
`;

export const ModelFootnote = styled.p`
  color: ${color("text-medium")};
  margin: 4px 0 0 0;
`;

export const ModelHeader = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-start;
  width: 100%;
`;
