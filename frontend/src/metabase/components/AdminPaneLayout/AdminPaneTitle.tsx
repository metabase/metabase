import cx from "classnames";

import Button from "metabase/common/components/Button";
import Link from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import { Box, Flex, Text } from "metabase/ui";

import type { AdminPaneProps } from "./types";

export const AdminPaneTitle = ({
  title,
  description,
  buttonText,
  buttonAction,
  buttonDisabled,
  buttonLink,
  headingContent,
}: AdminPaneProps) => {
  const buttonClassName = cx(CS.mlAuto, CS.flexNoShrink);
  return (
    <Box px="md">
      <Flex wrap="wrap" gap="md" justify="space-between">
        <Box>
          {headingContent && <>{headingContent}</>}
          {title && (
            <h2 data-testid="admin-pane-page-title" className={CS.m0}>
              {title}
            </h2>
          )}
          {description && <Text maw="40rem">{description}</Text>}
        </Box>
        <Box>
          {buttonText && buttonLink && (
            <Link to={buttonLink} className={buttonClassName}>
              <Button primary>{buttonText}</Button>
            </Link>
          )}
          {buttonText && buttonAction && (
            <Button
              className={buttonClassName}
              primary={!buttonDisabled}
              disabled={buttonDisabled}
              onClick={buttonAction}
            >
              {buttonText}
            </Button>
          )}
        </Box>
      </Flex>
    </Box>
  );
};
