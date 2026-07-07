import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { trackDataReferenceClicked } from "metabase/common/collections/analytics";
import { PLUGIN_UPLOAD_MANAGEMENT } from "metabase/plugins";
import { Flex, Group, Icon, Text, Title } from "metabase/ui";

import S from "./BrowseContainer.module.css";
import HeaderS from "./BrowseHeader.module.css";

type Props = {
  headerAction?: ReactNode;
};

export const BrowseDataHeader = ({ headerAction }: Props) => {
  return (
    <Flex className={S.browseHeader} direction="column">
      <Flex maw="64rem" mx="auto" w="100%">
        <Flex
          w="100%"
          h="2.25rem"
          direction="row"
          justify="space-between"
          align="center"
        >
          <Title order={2} c="text-primary">
            <Group gap="sm">
              <Icon size={24} c="core-brand" name="database" />
              {t`Databases`}
            </Group>
          </Title>
          <HeaderActions headerAction={headerAction} />
        </Flex>
      </Flex>
    </Flex>
  );
};

const HeaderActions = ({ headerAction }: Pick<Props, "headerAction">) => (
  <Flex p="0.75rem" justify="flex-end" align="center" gap="md">
    {headerAction ?? <LearnAboutDataLink />}
    <PLUGIN_UPLOAD_MANAGEMENT.GdriveDbMenu />
  </Flex>
);

const LearnAboutDataLink = () => (
  <Link to="reference" onClick={trackDataReferenceClicked}>
    <Flex className={HeaderS.browseHeaderIconContainer} align="center">
      <Icon className={S.learnAboutDataIcon} size={14} name="reference" />
      <Text size="md" lh="1" fw="bold" ml="sm" c="inherit">
        {t`Learn about our data`}
      </Text>
    </Flex>
  </Link>
);
