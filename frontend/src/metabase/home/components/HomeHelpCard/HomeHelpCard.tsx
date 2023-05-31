import { t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import { CardIcon, CardRoot, CardTitle } from "./HomeHelpCard.styled";

const HomeHelpCard = (): JSX.Element => {
  return (
    <CardRoot href={MetabaseSettings.learnUrl()}>
      <CardIcon name="reference" />
      <CardTitle>{t`Metabase tips`}</CardTitle>
    </CardRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default HomeHelpCard;
