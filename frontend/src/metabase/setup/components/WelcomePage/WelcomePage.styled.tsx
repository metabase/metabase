import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";

export const PageRoot = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
`;

export const PageMain = styled.main`
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: 7rem 0 2rem;
  max-width: 34.4rem;
`;

export const PageTitle = styled.h1`
  color: ${color("brand")};
  font-size: 2.2rem;
`;

export const PageBody = styled.div`
  color: ${color("text-medium")};
  font-size: 1.286em;
  line-height: 1.457em;
  margin: 1rem 0;
  text-align: center;
`;

export const PageButton = styled(Button)`
  margin-top: 2rem;
`;
