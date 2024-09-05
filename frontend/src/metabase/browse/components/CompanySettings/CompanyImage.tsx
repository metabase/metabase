import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { Flex, Group, Icon, Text, Title } from "metabase/ui";

import { BrowseHeader, BrowseSection } from "./CompanyContainer.styled";

export const CompanyImage = () => {
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
          <Title order={5} color="text-dark">
            <Group spacing="md">
              <Icon size={88} color={"#587330"} name="settings_image" />
              {t`Company name`}
            </Group>
          </Title>
        </Flex>
      </BrowseSection>
    </BrowseHeader>
  );
};
