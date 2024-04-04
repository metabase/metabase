import styled from "@emotion/styled";
import { KBarSearch } from "kbar";

import { color } from "metabase/lib/colors";

export const PaletteInput = styled(KBarSearch)`
  padding: 0.75rem;
  font-weight: bold;
  width: 100%;
  border-radius: 0.5rem;
  border: 1px solid ${color("border")};
  background: ${color("bg-light")};
  color: ${color("text-dark")};
  line-height: 1rem;

  &:focus {
    outline: 1px solid ${color("brand")};
  }
`;
