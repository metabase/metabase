import React, { Component, PropTypes } from "react";

import Revision from "./Revision.jsx";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx"


export default class RevisionHistory extends Component {
    static propTypes = {
        object: PropTypes.object,
        revisions: PropTypes.array,
        tableMetadata: PropTypes.object
    };

    render() {
        const { object, revisions, tableMetadata } = this.props;

        // TODO:
        const currentUser = { id: 1 };

        return (
            <LoadingAndErrorWrapper loading={!object || !revisions}>
            {() =>
                <div className="wrapper py4" style={{maxWidth: 950}}>
                    <h2 className="mb4">Revision History for "{object.name}"</h2>
                    <ol>
                    {revisions.map(revision =>
                        <Revision currentUser={currentUser} revision={revision} objectName={name} tableMetadata={tableMetadata} />
                    )}
                    </ol>
                </div>
            }
            </LoadingAndErrorWrapper>
        );
    }
}
