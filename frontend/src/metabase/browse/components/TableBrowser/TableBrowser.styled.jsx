import styled from "styled-components";
import { space } from "metabase/styled-components/theme";
import Card from "metabase/components/Card";
import Link from "metabase/components/Link";

export const TableLink = styled(Link)`
  display: block;
  margin-left: ${space(1)};
  overflow: hidden;
`;

export const TableActionLink = styled(Link)`
  line-height: initial;
  margin-left: ${space(1)};
`;

export const TableCard = styled(Card)`
  padding-left: ${space(1)};
  padding-right: ${space(1)};

  ${TableActionLink} {
    visibility: hidden;
  }

  &:hover ${TableActionLink} {
    visibility: visible;
  }
`;
