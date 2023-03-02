import React from "react";
import { connect } from "react-redux";
import { jt, t } from "ttag";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import ExternalLink from "metabase/core/components/ExternalLink";
import MetabaseSettings from "metabase/lib/settings";
import { getUpgradeUrl } from "metabase/selectors/settings";
import { State } from "metabase-types/store";

import { ToolbarButton } from "../ToolbarButton";
import { UpsellContent } from "./ToolbarUpsell.styled";

interface StateProps {
  upgradeUrl: string;
}

type ToolbarUpsellProps = StateProps;

const mapStateToProps = (state: State): StateProps => ({
  upgradeUrl: getUpgradeUrl(state, { utm_media: "permissions_top" }),
});

const ToolbarUpsell = ({ upgradeUrl }: ToolbarUpsellProps) => {
  return (
    <PopoverWithTrigger
      triggerElement={<ToolbarButton text={t`Get more control`} icon="bolt" />}
      placement="bottom-end"
    >
      <UpsellContent>
        {jt`${(
          <ExternalLink href={upgradeUrl}>
            {t`Upgrade to Pro or Enterprise`}
          </ExternalLink>
        )} and disable download results, control access to the data model, promote group managers, ${(
          <ExternalLink href={MetabaseSettings.docsUrl("permissions/start")}>
            {t`and more`}
          </ExternalLink>
        )}.`}
      </UpsellContent>
    </PopoverWithTrigger>
  );
};

export default connect(mapStateToProps)(ToolbarUpsell);
