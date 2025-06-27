import { t } from "ttag";

import ExternalLink from "metabase/common/components/ExternalLink";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { useSelector } from "metabase/lib/redux";
import { getLearnUrl } from "metabase/selectors/settings";
import {
  getApplicationName,
  getShowMetabaseLinks,
} from "metabase/selectors/whitelabel";

import { HomeCard } from "../HomeCard";

import { CardIcon, CardTitle } from "./HomeHelpCard.styled";

export const HomeHelpCard = (): JSX.Element | null => {
  const cardTitleId = useUniqueId();
  const applicationName = useSelector(getApplicationName);
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);

  if (!showMetabaseLinks) {
    return null;
  }

  return (
    <HomeCard
      component={ExternalLink}
      href={getLearnUrl()}
      aria-labelledby={cardTitleId}
    >
      <CardIcon name="reference" />
      <CardTitle id={cardTitleId}>{t`${applicationName} tips`}</CardTitle>
    </HomeCard>
  );
};
