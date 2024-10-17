import React from "react";
import { Flex, Group, Icon, Title } from "metabase/ui";
import { BrowseHeader, BrowseSection } from "./CompanyContainer.styled";
import { useSetting } from "metabase/common/hooks";
export const CompanyImage = () => {
  const siteName = useSetting("site-name");

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
          <Title
            order={5}
            color="text-dark"
            style={{ position: "relative", width: "100%" }}
          >
            <Group spacing="md" align="center">
              <Icon size={88} color={"#587330"} name="settings_image" />
              <span>{siteName}</span>
            </Group>
          </Title>
        </Flex>
      </BrowseSection>
    </BrowseHeader>
  );
};
