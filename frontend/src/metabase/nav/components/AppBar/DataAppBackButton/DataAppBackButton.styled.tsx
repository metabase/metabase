import styled from "@emotion/styled";

import Link from "metabase/core/components/Link";
import Icon from "metabase/components/Icon";

import { color } from "metabase/lib/colors";

export const DataAppLink = styled(Link)`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;

  font-size: 0.875rem;
  font-weight: bold;

  background-color: ${color("brand-light")};
  color: ${color("brand")};
  border: 1px solid ${color("brand-light")};

  padding: 8px 10px;
  border-radius: 99px;

  ${Icon.Root} {
    color: ${color("brand")};
  }
`;
