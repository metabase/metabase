import { Link } from "react-router";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { Flex, Group, Icon, Text, Title } from "metabase/ui";

import {
  BrowseHeader,
  BrowseSection,
  LearnAboutDataIcon,
} from "./BrowseContainer.styled";
import { BrowseHeaderIconContainer } from "./BrowseHeader.styled";

export const BrowseDataHeader = () => {
  return (
    <BrowseHeader>
      <BrowseSection>
        <Flex
          w="100%"
          h="2.25rem"
          direction="row"
          justify="space-between"
          align="center"
        >
          <Title order={1} color="text-dark">
            <Group spacing="sm">
              <Icon size={24} color={color("brand")} name="database" />
              {t`Databases`}
            </Group>
          </Title>
          <LearnAboutDataLink />
        </Flex>
      </BrowseSection>
    </BrowseHeader>
  );
};

const LearnAboutDataLink = () => (
  <Flex
    p=".75rem"
    justify="flex-end"
    align="center"
    style={{ flexBasis: "40.0%", marginInlineStart: "auto" }}
  >
    <Link to="reference">
      <BrowseHeaderIconContainer>
        <LearnAboutDataIcon size={14} name="reference" />
        <Text size="md" lh="1" fw="bold" ml=".5rem" c="inherit">
          {t`Learn about our data`}
        </Text>
      </BrowseHeaderIconContainer>
    </Link>
  </Flex>
);
