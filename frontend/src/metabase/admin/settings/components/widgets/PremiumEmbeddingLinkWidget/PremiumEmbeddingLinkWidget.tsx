import React from "react";
import { t } from "ttag";
import Link from "metabase/core/components/Link";
import { PremiumEmbeddingLinkWidgetRoot } from "./PremiumEmbeddingLinkWidget.styled";

export const PremiumEmbeddingLinkWidget = () => {
  return (
    <PremiumEmbeddingLinkWidgetRoot>
      {t`Have a Premium Embedding license?`}{" "}
      <Link
        to="/admin/settings/premium-embedding-license"
        className="link"
      >{t`Activate it here.`}</Link>
    </PremiumEmbeddingLinkWidgetRoot>
  );
};
