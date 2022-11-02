import styled from "@emotion/styled";
import { breakpointMinSmall } from "metabase/styled-components/theme";
import Form from "metabase/core/components/Form";

export const UserFormRoot = styled(Form)`
  margin-top: 1rem;
`;

export const UserFieldGroup = styled.div`
  ${breakpointMinSmall} {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }
`;
