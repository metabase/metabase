import cx from "classnames";
import { t } from "ttag";

import ExternalLink from "metabase/common/components/ExternalLink";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { getLearnUrl } from "metabase/selectors/settings";
import {
  getApplicationName,
  getShowMetabaseLinks,
} from "metabase/selectors/whitelabel";
import { Card, Flex, Icon, Text } from "metabase/ui";

export const HomeHelpCard = (): JSX.Element | null => {
  const cardTitleId = useUniqueId();
  const applicationName = useSelector(getApplicationName);
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);

  if (!showMetabaseLinks) {
    return null;
  }

  return (
    <Card
      component={ExternalLink}
      href={getLearnUrl()}
      aria-labelledby={cardTitleId}
      withBorder
      shadow="none"
      py="md"
      px="lg"
      classNames={{
        root: cx(
          CS.bgBrandHover,
          CS.hoverParent,
          CS.hoverDisplay,
          CS.textBrandHover,
        ),
      }}
    >
      <Flex align="center" h="100%" gap="md">
        <Icon name="reference" />
        <Text
          id={cardTitleId}
          fw="bold"
          fz="md"
          style={{
            color: "inherit",
          }}
        >{t`${applicationName} tips`}</Text>
      </Flex>
    </Card>
  );
};
