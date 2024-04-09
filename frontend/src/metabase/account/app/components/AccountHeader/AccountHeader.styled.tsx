import styled from "@emotion/styled";

import UserAvatar from "metabase/components/UserAvatar";
import { color } from "metabase/lib/colors";
import {
  breakpointMinMedium,
  breakpointMinSmall,
  space,
} from "metabase/styled-components/theme";

export const AccountHeaderRoot = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding-top: ${space(1)};
  border-bottom: 1px solid ${color("border")};
  background-color: ${color("white")};

  ${breakpointMinSmall} {
    padding-top: ${space(2)};
  }
`;

export const HeaderSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: ${space(2)};

  ${breakpointMinMedium} {
    padding: ${space(4)};
  }
`;

export const HeaderTitle = styled.h2`
  font-size: 1rem;
  text-align: center;
  margin-bottom: ${space(0)};
`;

export const HeaderSubtitle = styled.h3`
  text-align: center;
  color: ${color("text-medium")};
`;

export const HeaderAvatar = styled(UserAvatar)`
  width: 3em;
  height: 3em;
  margin-bottom: ${space(1)};

  ${breakpointMinSmall} {
    width: 4em;
    height: 4em;
    margin-bottom: ${space(2)};
  }

  ${breakpointMinMedium} {
    width: 5em;
    height: 5em;
  }
`;
