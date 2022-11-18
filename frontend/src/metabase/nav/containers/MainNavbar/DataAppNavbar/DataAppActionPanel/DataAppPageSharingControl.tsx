import React from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import Button from "metabase/core/components/Button";
import Tooltip from "metabase/components/Tooltip";

import { getUserIsAdmin } from "metabase/selectors/user";
import { getSetting } from "metabase/selectors/settings";

import DashboardSharingEmbeddingModal from "metabase/dashboard/containers/DashboardSharingEmbeddingModal";

import type { DataAppPage } from "metabase-types/api";
import type { State } from "metabase-types/store";

interface DataAppPageSharingControlOwnProps {
  page: DataAppPage;
}

interface DataAppPageSharingControlStateProps {
  isAdmin: boolean;
  isPublicSharingEnabled: boolean;
}

type DataAppPageSharingControlProps = DataAppPageSharingControlOwnProps &
  DataAppPageSharingControlStateProps;

function mapStateToProps(state: State) {
  return {
    isAdmin: getUserIsAdmin(state),
    isPublicSharingEnabled: getSetting(state, "enable-public-sharing"),
  };
}

function DataAppPageSharingControl({
  page,
  isAdmin,
  isPublicSharingEnabled,
}: DataAppPageSharingControlProps) {
  const isSharingAvailable =
    isPublicSharingEnabled && (isAdmin || page.public_uuid);
  const canSharePage = page.ordered_cards.length > 0;

  return (
    <DashboardSharingEmbeddingModal
      dashboard={page}
      enabled={isSharingAvailable}
      isLinkEnabled={canSharePage}
      linkText={
        <Tooltip
          tooltip={
            canSharePage ? t`Sharing` : t`Add content to share this page`
          }
        >
          <Button icon="share" onlyIcon disabled={!canSharePage} />
        </Tooltip>
      }
    />
  );
}

export default connect(mapStateToProps)(DataAppPageSharingControl);
