import { Link } from "react-router";
import { t } from "ttag";

import { Flex, Group, Icon, Text, Title } from "metabase/ui";

import {
  BrowseHeader,
  BrowseSection,
} from "./BrowseContainer.styled";
import { BrowseHeaderIconContainer } from "./BrowseHeader.styled";


export const BrowseSemanticHeader = () => {
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
            {t`Semantic Layer`}
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
        
      </BrowseHeaderIconContainer>
    </Link>
  </Flex>
);
