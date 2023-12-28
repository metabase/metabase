import { t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { CardIcon, CardRoot, CardTitle } from "./HomeHelpCard.styled";

export const HomeHelpCard = (): JSX.Element => {
  const cardTitleId = useUniqueId();
  const applicationName = useSelector(getApplicationName);
  return (
    <CardRoot href={MetabaseSettings.learnUrl()} aria-labelledby={cardTitleId}>
      <CardIcon name="reference" />
      <CardTitle id={cardTitleId}>{t`${applicationName} tips`}</CardTitle>
    </CardRoot>
  );
};
