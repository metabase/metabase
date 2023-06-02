import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/core/components/Icon";
import Ellipsified from "metabase/core/components/Ellipsified";

export const CardIcon = styled(Icon)`
  display: block;
  flex: 0 0 auto;
  color: ${color("brand")};
`;

export const CardTitle = styled(Ellipsified)`
  color: ${color("text-dark")};
  font-size: 1rem;
  font-weight: bold;
  margin-left: 1rem;
  max-width: 100%;
`;
