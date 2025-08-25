import { t } from "ttag";

import { UpsellPill } from "./components";
import { UPGRADE_URL } from "./constants";

export const UpsellSemanticSearchPill = ({ source }: { source: string }) => {
  return (
    <UpsellPill campaign="semantic-search" link={UPGRADE_URL} source={source}>
      {t`Get this with Pro. Try for free.`}
    </UpsellPill>
  );
};
