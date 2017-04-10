import React, { Component } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";

import ModalContent from "metabase/components/ModalContent.jsx";

import * as Urls from "metabase/lib/urls";

export default class CreatedDatabaseModal extends Component {
    static propTypes = {
        databaseId: PropTypes.number.isRequired,
        onClose: PropTypes.func.isRequired,
        onDone: PropTypes.func.isRequired
    };

    render() {
        const { onClose, onDone, databaseId } = this.props;
        return (
            <ModalContent
                title="Your database has been added!"
                onClose={onClose}
            >
                <div className="Form-inputs mb4">
                    <p>
                        We're analyzing its schema now to make some educated guesses about its
                        metadata. <Link to={"/admin/datamodel/database/"+databaseId}>View this
                        database</Link> in the Data Model section to see what we've found and to
                        make edits, or <Link to={Urls.question(null, `?db=${databaseId}`)}>ask a question</Link> about
                        this database.
                    </p>
                </div>

                <div className="Form-actions flex layout-centered">
                    <button className="Button Button--primary px3" onClick={onDone}>Done</button>
                </div>
            </ModalContent>
        );
    }
}
