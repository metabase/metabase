import React, { Component, PropTypes } from "react";

import Revision from "./Revision.jsx";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx"


export default class RevisionHistory extends Component {
    render() {
        const { name, revisions } = this.props;
        return (
            <LoadingAndErrorWrapper loading={!revisions}>
            {() =>
                <div className="wrapper py4" style={{maxWidth: 950}}>
                    <h2 className="mb4">Revision History for "{name}"</h2>
                    <ol>
                    {revisions.map(revision =>
                        <Revision revision={revision} objectName={name} />
                    )}
                    </ol>
                </div>
            }
            </LoadingAndErrorWrapper>
        );
    }
}
