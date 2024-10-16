import { t } from "ttag";
import { Flex, Group, Title } from "metabase/ui";
import { BrowseHeader, BrowseSection } from "./BrowseContainer.styled";

export const BrowseSemanticHeader = () => {

  return (
    <>
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
          </Flex>
        </BrowseSection>
      </BrowseHeader>
    </>
  );
};
