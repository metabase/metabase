import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import styled from "styled-components";
import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";

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

