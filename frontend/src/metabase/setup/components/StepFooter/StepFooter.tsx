import React from "react";
import { t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import ExternalLink from "metabase/components/ExternalLink";
import { StepFooterRoot } from "./StepFooter.styled";

const StepFooter = () => {
  return (
    <StepFooterRoot>
      {t`If you feel stuck`},{" "}
      <ExternalLink
        className="link"
        href={MetabaseSettings.docsUrl("setting-up-metabase")}
        target="_blank"
      >{t`our getting started guide`}</ExternalLink>{" "}
      {t`is just a click away.`}
    </StepFooterRoot>
  );
};

export default StepFooter;
