import styled from "@emotion/styled";
import UserPicker from "metabase/components/UserPicker";

export const CreatedByUserPicker = styled(UserPicker)`
  border: none;
  height: 2.5rem;

  & ul {
    display: flex;
    align-items: center;

    & li {
      height: 1.5rem;
    }
  }
`
