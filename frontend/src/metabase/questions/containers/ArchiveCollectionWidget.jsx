import React, { Component } from "react";
import { connect } from "react-redux";
import { t } from "c-3po";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import Button from "metabase/components/Button";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

import { setCollectionArchived } from "../collections";

const mapStateToProps = (state, props) => ({});

const mapDispatchToProps = {
  setCollectionArchived,
};

@connect(mapStateToProps, mapDispatchToProps)
export default class ArchiveCollectionWidget extends Component {
  _onArchive = async () => {
    try {
      await this.props.setCollectionArchived(this.props.collectionId, true);
      this._onClose();
      if (this.props.onArchived) {
        this.props.onArchived();
      }
    } catch (error) {
      console.error(error);
      this.setState({ error });
    }
  };

  _onClose = () => {
    if (this.refs.modal) {
      this.refs.modal.close();
    }
  };

  render() {
    return (
      <ModalWithTrigger
        {...this.props}
        ref="modal"
        triggerElement={
          <Tooltip tooltip={t`Archive collection`}>
            <Icon size={18} name="archive" />
          </Tooltip>
        }
        title={t`Archive this collection?`}
        footer={[
          <Button onClick={this._onClose}>{t`Cancel`}</Button>,
          <Button warning onClick={this._onArchive}>{t`Archive`}</Button>,
        ]}
      >
        <div className="px4 pb4">{t`The saved questions in this collection will also be archived.`}</div>
      </ModalWithTrigger>
    );
  }
}
