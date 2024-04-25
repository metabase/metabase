import styled from "@emotion/styled";

import Banner from "metabase/components/Banner";
import { color, lighten } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const EmptyBanner = styled(Banner)`
  border: 1px solid ${color("brand")};
  background-color: ${lighten("brand", 0.6)};
  display: flex;
  align-items: center;
  color: ${color("text-dark")};
  font-weight: bold;
  gap: 0.5rem;
  padding: 1rem;
`;

export const ColoredIcon = styled(Icon)`
  color: ${color("brand")};
`;
