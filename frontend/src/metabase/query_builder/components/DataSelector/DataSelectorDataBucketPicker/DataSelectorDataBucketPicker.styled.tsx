import styled from "@emotion/styled";

import SelectList from "metabase/components/SelectList";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import { Icon } from "metabase/ui";

export const DataBucketList = styled(SelectList)`
  width: 300px;
  padding: ${space(0)} ${space(1)} 12px ${space(1)};
`;

export const DataBucketListItemIcon = styled(Icon)`
  color: ${color("text-dark")};
`;

export const DataBucketTitleContainer = styled.div`
  display: flex;
  align-items: center;
`;

export const DataBucketListItemTitle = styled.span`
  color: ${color("text-dark")};
  font-weight: 700;
  font-size: 14px;
  margin-left: ${space(1)};
`;

export const DataBucketListItemDescriptionContainer = styled.div`
  margin-top: ${space(0)};
`;

export const DataBucketListItemDescription = styled.span`
  color: ${color("text-light")};
  font-weight: 700;
  font-size: 12px;
`;

export const DataBucketListItemContainer = styled(SelectList.BaseItem as any)`
  &:hover {
    ${DataBucketListItemIcon},
    ${DataBucketListItemTitle},
    ${DataBucketListItemDescription} {
      color: ${color("text-white")};
    }
  }
`;
