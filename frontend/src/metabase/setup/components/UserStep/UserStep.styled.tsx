import styled from "styled-components";
import { color } from "metabase/lib/colors";
import User from "metabase/entities/users";

export const StepDescription = styled.div`
  color: ${color("text-medium")};
  margin-top: 0.875rem;
`;

export const UserFormRoot = styled(User.Form)`
  margin-top: 1rem;
`;

export const UserFormGroup = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
`;
