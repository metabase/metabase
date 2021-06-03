import styled from "styled-components";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const PillContainer = styled.div`
  width: fit-content;
  display: flex;
  align-items: center;
  color: ${props => color(props.color)}
  padding: 4px 0;
`;

export const GrayscaleIcon = styled(Icon)`
  margin-right: 0.5rem;
  filter: grayscale(${props => (props.grayscale ? 1 : 0)});
`;
