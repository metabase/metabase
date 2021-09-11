import React from "react";
import { t } from "ttag";
import styled from "styled-components";
import Radio from "metabase/components/Radio";
import { CacheTTLField } from "../CacheTTLField";

export function CacheTTLInput(props) {
  return <CacheTTLField {...props} message={t`Cache results for`} />;
}

export const CacheTTLExpandedField = styled(CacheTTLInput)`
  margin-left: 1.3rem;
`;

export const StyledRadio = styled(Radio)`
  li {
    margin-top: 4px;
    font-weight: bold;
  }
`;
