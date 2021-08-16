import styled from "styled-components";
import {
  breakpointMinMedium,
  breakpointMinSmall,
  space,
} from "metabase/styled-components/theme";
import UserAvatar from "metabase/components/UserAvatar";

export const AccountHeaderRoot = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding-top: ${space(1)};

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
  text-align: center;
`;

export const HeaderAvatar = styled(UserAvatar)`
  width: 3rem;
  height: 3rem;
  margin-bottom: ${space(1)};

  ${breakpointMinSmall} {
    width: 4rem;
    height: 4rem;
    margin-bottom: ${space(2)};
  }

  ${breakpointMinMedium} {
    width: 5rem;
    height: 5rem;
  }
`;
