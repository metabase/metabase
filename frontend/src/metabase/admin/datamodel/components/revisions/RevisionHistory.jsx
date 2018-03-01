import React, { Component } from "react";
import PropTypes from "prop-types";

import Revision from "./Revision.jsx";
import { t } from "c-3po";
import Breadcrumbs from "metabase/components/Breadcrumbs.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

import { assignUserColors } from "metabase/lib/formatting";

export default class RevisionHistory extends Component {
  static propTypes = {
    object: PropTypes.object,
    revisions: PropTypes.array,
    tableMetadata: PropTypes.object,
  };

  render() {
    const { object, revisions, tableMetadata, user } = this.props;

    let userColorAssignments = {};
    if (revisions) {
      userColorAssignments = assignUserColors(
        revisions.map(r => r.user.id),
        user.id,
      );
    }

    return (
      <LoadingAndErrorWrapper loading={!object || !revisions}>
        {() => (
          <div className="wrapper">
            <Breadcrumbs
              className="py4"
              crumbs={[
                [
                  t`Datamodel`,
                  "/admin/datamodel/database/" +
                    tableMetadata.db_id +
                    "/table/" +
                    tableMetadata.id,
                ],
                [this.props.objectType + t` History`],
              ]}
            />
            <div className="wrapper py4" style={{ maxWidth: 950 }}>
              <h2 className="mb4">
                {t`Revision History for`} "{object.name}"
              </h2>
              <ol>
                {revisions.map(revision => (
                  <Revision
                    revision={revision}
                    objectName={name}
                    currentUser={user}
                    tableMetadata={tableMetadata}
                    userColor={userColorAssignments[revision.user.id]}
                  />
                ))}
              </ol>
            </div>
          </div>
        )}
      </LoadingAndErrorWrapper>
    );
  }
}
