import React from "react";
import { t } from "ttag";
import styled from "@emotion/styled";
import Icon from "metabase/components/Icon";
import SelectList from "metabase/components/SelectList";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const DataSelectorSection = styled.section`
  width: 300px;
`;

export const DataBucketIcon = styled(Icon)`
  margin-top: 2px;
  color: ${color("text-dark")} !important;
`;

export const DataBucketDescription = styled.span`
  font-weight: bold;
  font-size: 12px;
`;

const BackButtonContainer = styled.div`
  display: flex;
  align-items: center;
  cursor: pointer;
`;

const BackButtonLabel = styled.span`
  font-size: 16px;
  color: ${color("text-dark")};

  margin-left: ${space(1)};

  overflow-wrap: anywhere;
  word-break: break-word;
  word-wrap: anywhere;

  :hover {
    color: ${color("brand")};
  }
`;

export function RawDataBackButton() {
  return (
    <BackButtonContainer>
      <Icon name="chevronleft" size={16} />
      <BackButtonLabel>{t`Raw Data`}</BackButtonLabel>
    </BackButtonContainer>
  );
}

export const DataBucketList = styled(SelectList)`
  width: 300px;
  padding: ${space(0)} ${space(1)} 12px ${space(1)};
`;

export const CollectionDatasetSelectList = styled(SelectList)`
  width: 300px;
  max-width: 300px;
  padding: 0.5rem;
`;

CollectionDatasetSelectList.Item = SelectList.Item;

export const CollectionDatasetAllDataLink = styled(SelectList.BaseItem)`
  padding: 0.5rem;

  color: ${color("text-light")};
  font-weight: bold;
  cursor: pointer;

  :hover {
    color: ${color("brand")};
  }
`;

CollectionDatasetAllDataLink.Content = styled.span`
  display: flex;
  align-items: center;

  .Icon {
    margin-left: ${space(0)};
  }
`;

export const EmptyStateContainer = styled.div`
  width: 300px;
  padding: 80px 60px;
`;
