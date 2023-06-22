import { t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import { CardIcon, CardRoot, CardTitle } from "./HomeHelpCard.styled";

export const HomeHelpCard = (): JSX.Element => {
  const cardTitleId = useUniqueId();
  return (
    <CardRoot href={MetabaseSettings.learnUrl()} aria-labelledby={cardTitleId}>
      <CardIcon name="reference" />
      <CardTitle id={cardTitleId}>{t`Metabase tips`}</CardTitle>
    </CardRoot>
  );
};
