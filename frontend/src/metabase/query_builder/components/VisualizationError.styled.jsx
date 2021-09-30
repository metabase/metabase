import styled from "styled-components";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const QueryError = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  margin: 0 auto;
  max-width: 31.25rem;
  color: ${color("error")};
`;

export const QueryErrorIcon = styled.div`
  padding: ${space(3)};
  margin-bottom: ${space(3)};
  border: 0.25rem solid ${color("accent3")};
  border-radius: 50%;
`;

export const QueryErrorMessage = styled.div`
  max-width: 100%;
`;
