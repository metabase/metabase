import styled from "styled-components";

import { space } from "metabase/styled-components/theme";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const InfoContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${space(2)};
  padding: ${space(2)};
  overflow: auto;
`;

export const Description = styled.div`
  font-size: 14px;
  white-space: pre-line;
  max-height: 200px;
  overflow: auto;
`;

export const EmptyDescription = styled(Description)`
  color: ${color("text-light")};
  font-weight: 700;
`;

export const LabelContainer = styled.div`
  display: inline-flex;
  align-items: center;
  column-gap: ${space(0)};
  font-size: 12px;
  color: ${({ color: _color = "brand" }) => color(_color)};
`;

export const Label = styled.span`
  font-weight: 900;
  font-size: 1em;
`;

export const RelativeSizeIcon = styled(Icon)`
  height: 1em;
  width: 1em;
`;

export const InvertedColorRelativeSizeIcon = styled(RelativeSizeIcon)`
  padding: ${space(0)};
  background-color: ${color("brand")};
  color: ${color("white")};
  border-radius: ${space(0)};
  padding: ${space(0)};
`;
