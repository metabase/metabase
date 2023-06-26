import { t } from "ttag";
import styled from "@emotion/styled";
import { space } from "metabase/styled-components/theme";
import Radio from "metabase/core/components/Radio";
import CacheTTLField from "../CacheTTLField";

export function CacheTTLInput(props) {
  return <CacheTTLField {...props} message={t`Cache results for`} />;
}

export const CacheTTLExpandedField = styled(CacheTTLInput)`
  margin-left: 1.3rem;
`;

export const StyledRadio = styled(Radio)`
  li {
    margin-top: ${space(0)};
    font-weight: bold;
  }
`;
