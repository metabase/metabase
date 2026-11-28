import { t } from "ttag";

import { trackDataReferenceClicked } from "metabase/common/collections/analytics";
import { Link } from "metabase/common/components/Link";
import { PageMetabotButton } from "metabase/nav/prototype/PageMetabotButton";
import { PLUGIN_UPLOAD_MANAGEMENT } from "metabase/plugins";
import { Flex, Icon, Text, Title } from "metabase/ui";

import S from "./BrowseContainer.module.css";
import HeaderS from "./BrowseHeader.module.css";

export const BrowseDataHeader = () => {
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
          {/* PROTOTYPE: no database icon before the heading. */}
          <Title order={1} c="text-primary">
            {t`Databases`}
          </Title>
          <LearnAboutDataLink />
        </Flex>
      </Flex>
    </Flex>
  );
};

const LearnAboutDataLink = () => (
  <Flex p="0.75rem" justify="flex-end" align="center" gap="lg">
    <Link to="reference" onClick={trackDataReferenceClicked}>
      <Flex className={HeaderS.browseHeaderIconContainer} align="center">
        <Icon className={S.learnAboutDataIcon} size={14} name="reference" />
        <Text size="md" lh="1" fw="bold" ml="sm" c="inherit">
          {t`Learn about our data`}
        </Text>
      </Flex>
    </Link>
    <PLUGIN_UPLOAD_MANAGEMENT.GdriveDbMenu />
    {/* PROTOTYPE: "No top nav" puts Chat with Metabot last. */}
    <PageMetabotButton />
  </Flex>
);
