import styled from "styled-components";
import User from "metabase/entities/users";

export const UserForm = styled(User.Form)`
  margin-top: 1rem;
`;

export const FieldGroup = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
`;
