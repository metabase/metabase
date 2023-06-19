import styled from "@emotion/styled";

import { Icon } from "metabase/core/components/Icon";
import SelectList from "metabase/components/SelectList";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const List = styled(SelectList)`
  ${SelectList.BaseItem.Root} {
    &:hover {
      background-color: ${color("brand")};
    }
  }
`;

export const ItemIcon = styled(Icon)`
  color: ${color("text-dark")};
`;

export const TitleContainer = styled.div`
  display: flex;
  align-items: center;
`;

export const ItemTitle = styled.span`
  color: ${color("text-dark")};
  font-weight: 700;
  font-size: 14px;
  margin-left: ${space(1)};
`;

export const ItemDescriptionContainer = styled.div`
  margin-top: ${space(0)};
`;

export const ItemDescription = styled.span`
  color: ${color("text-light")};
  font-weight: 700;
  font-size: 12px;
`;

export const ItemContainer = styled(SelectList.BaseItem as any)`
  &:hover {
    ${ItemIcon},
    ${ItemTitle},
    ${ItemDescription} {
      color: ${color("text-white")};
    }
  }
`;
