import { c, t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { color } from "metabase/lib/colors";
import { Box, Flex, Icon, Text } from "metabase/ui";

import { LargeIconContainer, MigrationCard } from "./CloudPanel.styled";

interface MigrationCreationErrorProps {
  error: any;
}

export const MigrationCreationError = ({
  error,
}: MigrationCreationErrorProps) => {
  return (
    <MigrationCard>
      <Flex gap="md">
        <LargeIconContainer color={color("error")}>
          <Icon size="1.5rem" name="warning" />
        </LargeIconContainer>
        <Box>
          <Text fw="bold">{t`Migration to Metabase Cloud failed`}</Text>
          {error.data && <Text mt=".5rem">{error.data}</Text>}
          <Text mt="1rem">
            {c("{0} is an email address")
              .jt`Please try again later, and reach out to us at ${
              (
                // eslint-disable-next-line i18next/no-literal-string
                <Link key="email" variant="brand" to="mailto:help@metabase.com">
                  help@metabase.com
                </Link>
              )
            } if you need help.`}
          </Text>
        </Box>
      </Flex>
    </MigrationCard>
  );
};
