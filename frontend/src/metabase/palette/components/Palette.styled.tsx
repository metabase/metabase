import styled from "@emotion/styled";
import { KBarSearch } from "kbar";

export const PaletteInput = styled(KBarSearch)`
  padding: 0.75rem;
  font-weight: bold;
  width: 100%;
  border-radius: 0.5rem;
  border: 1px solid var(--mb-color-border);
  background: var(--mb-color-bg-light);
  color: var(--mb-color-text-dark);
  line-height: 1rem;

  &:focus {
    outline: 1px solid var(--mb-color-brand);
  }
`;
