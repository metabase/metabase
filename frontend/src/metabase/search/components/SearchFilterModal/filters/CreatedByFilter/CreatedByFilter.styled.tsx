import styled from "@emotion/styled";
import UserPicker from "metabase/components/UserPicker";
import { color } from "metabase/lib/colors";

export const CreatedByUserPicker = styled(UserPicker)`
  border: none;

  & ul {
    display: flex;
    align-items: center;

    & li {
    }
  }

  & [class*="-TokenFieldContainer"] {
    padding: 0;
    height: 40px;
  }

  & [class*="-TokenInputItem"] {
    height: unset;
  }

  & [class*="-TokenFieldItem"] {
    background: transparent;
    color: ${color("text-dark")};
    display: grid;
    width: 100%;
    grid-template-columns: 1fr auto;
    height: unset;

    & > span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
`;
