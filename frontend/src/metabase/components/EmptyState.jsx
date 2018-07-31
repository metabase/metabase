/* @flow */
import React from "react";
import { Box, Flex } from "grid-styled";

import Button from "metabase/components/Button";
import Link from "metabase/components/Link";
import Text from "metabase/components/Text";

/*
 * EmptyState is a component that can
 *  1) introduce a new section of Metabase to a user and encourage the user to take an action
 *  2) indicate an empty result after a user-triggered search/query
 */

type EmptyStateProps = {
  message: React$Element<any>,
  title?: string,
  action?: string,
  link?: string,
  illustrationElement: React$Element<any>,
  onActionClick?: () => void,
};

const EmptyState = ({
  title,
  message,
  action,
  link,
  illustrationElement,
  onActionClick,
  ...rest
}: EmptyStateProps) => (
  <Box {...rest}>
    <Flex justify="center" flexDirection="column" align="center">
      <Box>{illustrationElement && illustrationElement}</Box>
      {title && <h2>{title}</h2>}
      {message && <Text color="medium">{message}</Text>}
    </Flex>
    <Box mt={2}>
      {action &&
        link && (
          <Link
            to={link}
            mt={4}
            target={link.startsWith("http") ? "_blank" : ""}
          >
            <Button primary>{action}</Button>
          </Link>
        )}
      {action &&
        onActionClick && (
          <Button onClick={onActionClick} primary mt={4}>
            {action}
          </Button>
        )}
    </Box>
  </Box>
);

export default EmptyState;
