import React, { Component, PropTypes } from "react";

import ModalContent from "metabase/components/ModalContent.jsx";

export default class CreatedDatabaseModal extends Component {
    static propTypes = {
        onClose: PropTypes.func.isRequired,
        onDone: PropTypes.func.isRequired
    };

    render() {
        return (
            <ModalContent
                title="Your database has been added!"
                closeFn={this.props.onClose}
            >
                <div className="Form-inputs mb4">
                    <p>We're analyzing its schema now to make some educated guesses about its metadata. Click on the Metadata section to see what we've found and to make edits.</p>
                </div>

                <div className="Form-actions flex layout-centered">
                    <button className="Button Button--primary px3" onClick={() => this.props.onDone()}>Done</button>
                </div>
            </ModalContent>
        );
    }
}
