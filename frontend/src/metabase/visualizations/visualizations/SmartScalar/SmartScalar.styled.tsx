// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { space } from "metabase/styled-components/theme";
import { Icon } from "metabase/ui";

export const VariationIcon = styled(Icon)`
  display: flex;
  flex: 0 0 auto;
  margin-right: ${space(0)};
  color: ${(props) => props.color};
`;
