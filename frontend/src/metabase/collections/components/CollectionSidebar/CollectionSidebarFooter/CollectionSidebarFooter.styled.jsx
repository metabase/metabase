import styled from "@emotion/styled";

import { space } from "metabase/styled-components/theme";

import GenericIcon from "metabase/components/Icon";
import GenericLink from "metabase/core/components/Link";
import { SIDEBAR_SPACER } from "metabase/collections/constants";

export const Container = styled.div`
  padding-bottom: ${space(2)};
  padding-left: ${SIDEBAR_SPACER * 2}px;
`;

export const Icon = styled(GenericIcon)`
  margin-right: ${space(1)};
`;

export const Link = styled(GenericLink)`
  align-items: center;
  display: flex;
  font-weight: 700;
  margin-top: ${space(1)};

  &:hover {
    text-decoration: underline;
  }
`;
