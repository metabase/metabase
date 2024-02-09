import styled from "@emotion/styled";
import type { FieldInfoIconProps } from "metabase/components/MetadataInfo/FieldInfoIcon";
import { FieldInfoIcon as Base } from "metabase/components/MetadataInfo/FieldInfoIcon";

type Props = Omit<FieldInfoIconProps, "position">;

export function FieldInfoIcon(props: Props) {
  return (
    <Wrapper>
      <Base {...props} position="left" />
    </Wrapper>
  );
}

const Wrapper = styled.span`
  display: flex;
  align-items: center;
  position: relative;
  left: -0.75em;

  ${Base.HoverTarget} {
    padding: 0.25em;
  }

  li:hover & ${Base.HoverTarget} {
    opacity: 0.4;
  }
`;
