import styled from "styled-components";
import { Box } from "grid-styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

import GenericIcon from "metabase/components/Icon";
import GenericLink from "metabase/components/Link";
import { SIDEBAR_SPACER } from "metabase/collections/constants";

export const Container = styled(Box)`
  margin-top: auto;
  padding-bottom: ${space(2)};
  padding-left: ${SIDEBAR_SPACER * 2}px;
`;

export const Icon = styled(GenericIcon)`
  margin-right: ${space(1)};
`;

export const Link = styled(GenericLink)`
  align-items: center;
  color: ${color("text-light")};
  display: flex;
  font-weight: 700;
  margin-top: ${space(2)};

  &:hover {
    color: ${color("brand")};
  }
`;
