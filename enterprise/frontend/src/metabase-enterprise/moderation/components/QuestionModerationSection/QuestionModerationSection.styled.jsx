import styled from "styled-components";
import { color } from "metabase/lib/colors";
import ModerationActions from "../ModerationActions/ModerationActions";

export const BorderedModerationActions = styled(ModerationActions)`
  border-top: 1px solid ${color("border")};
  padding-top: 1rem;
`;
