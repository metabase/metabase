import styled from "styled-components";

import EntityItem from "metabase/components/EntityItem";
import { color } from "metabase/lib/colors";

export const EntityItemMenu = styled(EntityItem.Menu)`
  color: ${color("text-medium")};
`;
