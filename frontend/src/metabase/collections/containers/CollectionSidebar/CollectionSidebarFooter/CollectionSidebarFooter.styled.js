import styled from "styled-components";
import { Box } from "grid-styled";

import { space } from "metabase/styled-components/theme";

import GenericIcon from "metabase/components/Icon";
import GenericLink from "metabase/components/Link";
import { SIDEBAR_SPACER } from "metabase/collections/constants";

export const Container = styled(Box).attrs({ className: "mt-auto" })`
  padding-left: ${SIDEBAR_SPACER * 2};
`;
export const Icon = styled(GenericIcon)`
  margin-right: ${space(1)};
`;

export const Link = styled(GenericLink).attrs({
  className: "flex align-center text-light text-brand-hover",
})``;
