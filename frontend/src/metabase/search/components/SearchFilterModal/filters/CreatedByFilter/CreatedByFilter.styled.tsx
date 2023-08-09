import styled from "@emotion/styled";
import UserPicker from "metabase/components/UserPicker";
import { color } from "metabase/lib/colors";

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

  & [class*="-TokenFieldItem"] {
    background: transparent;
    color: ${color("text-dark")};
  }
`;
