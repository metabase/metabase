import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import styled from "styled-components";
import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const DataBucketIcon = styled(Icon)`
  margin-top: 2px;
  color: ${color("text-dark")} !important;
`;

export const DataBucketDescription = styled.span`
  font-weight: bold;
  font-size: 12px;
`;

RawDataBackButton.propTypes = {
  onBack: PropTypes.func.isRequired,
};

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

export function RawDataBackButton({ onBack }) {
  return (
    <BackButtonContainer onClick={onBack}>
      <Icon name="chevronleft" size={16} />
      <BackButtonLabel>{t`Raw Data`}</BackButtonLabel>
    </BackButtonContainer>
  );
}
