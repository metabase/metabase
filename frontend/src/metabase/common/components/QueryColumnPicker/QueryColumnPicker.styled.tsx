import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import type { ColorName } from "metabase/lib/colors/types";

export const Root = styled.div<{ color: ColorName }>`
  color: ${props => color(props.color)};
`;
