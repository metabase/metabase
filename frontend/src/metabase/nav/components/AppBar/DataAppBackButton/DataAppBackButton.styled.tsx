import styled from "@emotion/styled";

import Link from "metabase/core/components/Link";
import Icon from "metabase/components/Icon";

import { alpha, color } from "metabase/lib/colors";

export const DataAppLink = styled(Link)`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;

  font-size: 0.875rem;
  font-weight: bold;

  background-color: ${alpha("brand", 0.2)};
  color: ${color("brand")};
  border: 1px solid ${alpha("brand", 0.2)};

  padding: 8px 10px;
  border-radius: 99px;

  transition: background 300ms linear, border 300ms linear;

  ${Icon.Root} {
    color: ${color("brand")};
  }

  &:hover {
    background-color: ${alpha("brand", 0.35)};
  }
`;
