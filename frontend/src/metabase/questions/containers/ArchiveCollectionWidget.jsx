import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import Button from "metabase/components/Button";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

import { archiveCollection } from "../collections";

const mapStateToProps = (state, props) => ({
})

const mapDispatchToProps = {
    archiveCollection
}

@connect(mapStateToProps, mapDispatchToProps)
export default class ArchiveCollectionWidget extends Component {
    _onArchive = async () => {
        try {
            this.props.archiveCollection(this.props.collectionId)
        } catch (error) {
            console.error(error)
            this.setState({ error })
        }
    }

    render() {
        console.log(this.props);
        return (
            <ModalWithTrigger
                {...this.props}
                triggerElement={
                    <Tooltip tooltip="Archive collection">
                        <Icon name="archive" />
                    </Tooltip>
                }
                title="Archive this collection?"
                footer={[
                    <Button>Cancel</Button>,
                    <Button warning onClick={this._onArchive}>Archive</Button>
                ]}
            >
                <div>hello</div>
            </ModalWithTrigger>
        );
    }
}
