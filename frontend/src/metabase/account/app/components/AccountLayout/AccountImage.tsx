import { t } from "ttag";
import type { Path } from "history";
import { useMemo } from "react";

import Radio from "metabase/core/components/Radio";
import { getFullName } from "metabase/lib/user";
import { PLUGIN_IS_PASSWORD_USER } from "metabase/plugins";
import type { User } from "metabase-types/api";
import { color } from "metabase/lib/colors";
import { Flex, Group, Icon, Text, Title } from "metabase/ui";

import { BrowseHeader, BrowseSection } from "./AccountLayout.styled";
import {
  HeaderSubtitle,
  HeaderTitle,
  HeaderSection,
} from "../AccountHeader/AccountHeader.styled";

type AccountHeaderProps = {
  user: User;
  path?: string;
  onChangeLocation?: (nextLocation: Path) => void;
};

export const AccountImage = ({
  user,
  path,
  onChangeLocation,
}: AccountHeaderProps) => {
  const userFullName = getFullName(user);
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
          <Title order={4} color="text-dark">
            <Group spacing="md">
              <Icon size={88} color={"#587330"} name="settings_image" />
              <div style={{ display: "flex", flexDirection: "column" }}>
                {userFullName && <HeaderTitle>{userFullName}</HeaderTitle>}
                <HeaderSubtitle>{user.email}</HeaderSubtitle>
              </div>
            </Group>
          </Title>
        </Flex>
      </BrowseSection>
    </BrowseHeader>
  );
};
