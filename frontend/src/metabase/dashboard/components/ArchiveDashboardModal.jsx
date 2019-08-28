import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import ArchiveModal from "metabase/components/ArchiveModal";

export default class ArchiveDashboardModal extends Component {
  static propTypes = {
    onClose: PropTypes.func,
    onArchive: PropTypes.func,
  };

  render() {
    const { onArchive, onClose } = this.props;
    return (
      <ArchiveModal
        title={t`Archive this dashboard?`}
        message={t`Are you sure you want to do this?`}
        onClose={onClose}
        onArchive={onArchive}
      />
    );
  }
}
