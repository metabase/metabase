import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import BaseTabList from "metabase/core/components/TabList";
import TabLink from "metabase/core/components/TabLink";
import TabButton from "metabase/core/components/TabButton";

export const TabList = styled(BaseTabList)`
  border-bottom: 1px solid ${color("border")};

  ${BaseTabList.Content} {
    display: flex;
    overflow: hidden;
  }

  ${TabLink.Root}:not(:last-child) {
    margin-right: 2rem;
  }

  ${TabButton.Root}:not(:last-child) {
    margin-right: 2rem;
  }
`;
