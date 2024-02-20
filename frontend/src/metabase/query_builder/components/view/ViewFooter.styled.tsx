import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import ButtonGroup from "metabase/core/components/ButtonGroup";

import ViewSection from "./ViewSection";

export const ViewFooterRoot = styled(ViewSection)`
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
`;

export const FooterButtonGroup = styled(ButtonGroup)`
  display: inline-flex;
  align-items: stretch;

  ${Button.Root} {
    border: 1px solid ${"white"};
  }
`;
