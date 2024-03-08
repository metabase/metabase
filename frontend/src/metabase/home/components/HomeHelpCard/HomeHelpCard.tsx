import { t } from "ttag";

import { useUniqueId } from "metabase/hooks/use-unique-id";
import { useSelector } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";
import {
  getApplicationName,
  getShowMetabaseLinks,
} from "metabase/selectors/whitelabel";

import { CardIcon, CardRoot, CardTitle } from "./HomeHelpCard.styled";

export const HomeHelpCard = (): JSX.Element | null => {
  const cardTitleId = useUniqueId();
  const applicationName = useSelector(getApplicationName);
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);

  if (!showMetabaseLinks) {
    return null;
  }

  return (
    <CardRoot href={MetabaseSettings.learnUrl()} aria-labelledby={cardTitleId}>
      <CardIcon name="reference" />
      <CardTitle id={cardTitleId}>{t`${applicationName} tips`}</CardTitle>
    </CardRoot>
  );
};
