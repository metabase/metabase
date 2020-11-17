/* @flow */
import React from "react";
import { Box, Flex } from "grid-styled";

import Button from "metabase/components/Button";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import Text from "metabase/components/Text";

type EmptyStateProps = {
  message?: React$Element<any>,
  title?: string,
  action?: string,
  link?: string,
  illustrationElement: React$Element<any>,
  onActionClick?: () => void,
};

// Don't break existing empty states
// TODO - remove these and update empty states with proper usage of illustrationElement
const LegacyIcon = props =>
  props.icon ? (
    <Icon name={props.icon} className="text-light" size={40} />
  ) : null;
const LegacyImage = props =>
  props.image ? (
    <img
      src={`${props.image}.png`}
      width="300px"
      height={props.imageHeight}
      alt={props.message}
      srcSet={`${props.image}@2x.png 2x`}
      className={props.imageClassName}
    />
  ) : null;

const EmptyState = ({
  title,
  message,
  action,
  link,
  illustrationElement,
  onActionClick,
  ...rest
}: EmptyStateProps) => (
  <Box>
    <Flex justify="center" flexDirection="column" align="center">
      {illustrationElement && <Box mb={[2, 3]}>{illustrationElement}</Box>}
      <Box>
        <LegacyIcon {...rest} />
        <LegacyImage {...rest} />
      </Box>
      {title && <h2>{title}</h2>}
      {message && <Text color="medium">{message}</Text>}
    </Flex>
    {/* TODO - we should make this children or some other more flexible way to
      add actions
      */}
    <Flex mt={2}>
      <Flex align="center" ml="auto" mr="auto">
        {action && link && (
          <Link to={link} target={link.startsWith("http") ? "_blank" : ""}>
            <Button primary>{action}</Button>
          </Link>
        )}
        {action && onActionClick && (
          <Button onClick={onActionClick} primary>
            {action}
          </Button>
        )}
      </Flex>
    </Flex>
  </Box>
);

export default EmptyState;
