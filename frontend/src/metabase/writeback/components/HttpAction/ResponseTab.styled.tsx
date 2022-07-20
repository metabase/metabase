import styled from "@emotion/styled";
import { color, alpha, lighten } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(3, auto);
  grid-gap: ${space(2)};

  padding: ${space(2)};
`;

export const Info = styled.div`
  display: flex;
  flex-direction: column;
`;

export const Title = styled.div`
  font-size: 1.5rem;
  font-weight: 600;
  color: ${color("text-dark")};
`;

export const Description = styled.div`
  font-size: 0.75rem;
  font-weight: 400;
  color: ${color("text-medium")};
`;

export const TextArea = styled.textarea`
  color: ${color("text-medium")};

  border: none;
  overflow: auto;
  outline: none;

  box-shadow: none;

  resize: none;

  &:focus {
    color: ${color("text-dark")};
  }

  &::placeholder {
    color: ${color("text-light")};
  }
`;

export const Spacer = styled.div`
  grid-column: span 2;
`;
