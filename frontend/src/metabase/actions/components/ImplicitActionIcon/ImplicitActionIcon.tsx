import { Flex, Icon } from "metabase/ui";

interface ImplicitActionIconProps {
  size?: number;
}

function ImplicitActionIcon({ size = 14 }: ImplicitActionIconProps) {
  const sizeSmall = size * 0.375;
  const marginLeft = size * 0.75;
  return (
    <Flex direction="column" justify="center">
      <Icon name="insight" size={sizeSmall} style={{ marginLeft }} />
      <Icon name="insight" size={size} />
    </Flex>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ImplicitActionIcon;
