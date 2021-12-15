import styled from "styled-components";

import Button from "metabase/components/Button";

import { space } from "metabase/styled-components/theme";

export const SearchSectionContainer = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

export const CloseButton = styled(Button).attrs({
  icon: "close",
  onlyIcon: true,
})`
  margin-left: ${space(1)};
`;

export const ExtraSelectContainer = styled.div`
  margin-top: 1em;
`;
