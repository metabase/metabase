import styled from "@emotion/styled";
import { t } from "ttag";

import SelectList from "metabase/components/SelectList";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import { Icon, Text } from "metabase/ui";

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

export const EmptyStateContainer = styled.div`
  width: 300px;
  padding: 80px 60px;
`;

export const TableSearchContainer = styled.div`
  padding: 0.5rem;
  border-bottom: 1px solid ${color("border")};
`;

export const TriggerContainer = styled.div`
  width: 100%;
  position: relative;
  padding: 0.5rem 2.625rem 0.5rem 0.6875rem;
  border: 1px solid ${color("border")};
  border-radius: ${space(0)};
  cursor: pointer;
`;

export const TriggerContainerIcon = styled.div`
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  right: -1px;
  top: 0;
  width: 2.5rem;
  height: 100%;
`;

export const TextSchema = styled(Text)`
  font-size: 0.75em;
  color: ${color("text-light")};
  line-height: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;
