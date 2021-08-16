import styled from "styled-components";
import colors from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import Text from "metabase/components/type/Text";

export const EmptyRoot = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 5rem;
`;

export const EmptyIcon = styled(Icon).attrs({
  name: "bell",
  size: 52,
})`
  color: ${colors["bg-dark"]};
`;

export const EmptyMessage = styled(Text).attrs({
  color: "dark",
})`
  margin-top: 2rem;
  max-width: 24rem;
  text-align: center;
`;
