import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { breakpointMinSmall } from "metabase/styled-components/theme";
import User from "metabase/entities/users";

export const StepDescription = styled.div`
  color: ${color("text-medium")};
  margin-top: 0.875rem;
`;

export const UserFormRoot = styled(User.Form)`
  margin-top: 1rem;
`;

export const UserFormGroup = styled.div`
  ${breakpointMinSmall} {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }
`;
