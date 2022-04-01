import React from "react";
import _ from "underscore";
import { jt, t } from "ttag";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import ExternalLink from "metabase/core/components/ExternalLink";
import MetabaseSettings from "metabase/lib/settings";

import { ToolbarButton } from "../ToolbarButton";
import { UpsellContent } from "./ToolbarUpsell.styled";

export const ToolbarUpsell = () => {
  return (
    <PopoverWithTrigger
      triggerElement={<ToolbarButton text={t`Get more control`} icon="bolt" />}
      placement="bottom-end"
    >
      <UpsellContent>
        {jt`${(
          <ExternalLink href={MetabaseSettings.upgradeUrl()}>
            Upgrade to Pro or Enterprise
          </ExternalLink>
        )} and disable downloading results, manage access to the data model, ${(
          <ExternalLink
            // TODO: Update URL
            href={MetabaseSettings.docsUrl(
              "administration-guide/data-permissions",
            )}
          >
            and more
          </ExternalLink>
        )}.`}
      </UpsellContent>
    </PopoverWithTrigger>
  );
};
