import React from "react";
import EmptyState from "metabase/components/EmptyState";
import Link from "metabase/components/Link";
import { t } from "c-3po";

// TODO: port to ErrorMessage for more consistent style

const Archived = ({ entityName, linkTo }) => (
  <div className="full-height flex justify-center align-center">
    <EmptyState
      message={
        <div>
          <div>{t`This ${entityName} has been archived`}</div>
          <Link
            to={linkTo}
            className="my2 link"
            style={{ fontSize: "14px" }}
          >{t`View the archive`}</Link>
        </div>
      }
      icon="viewArchive"
    />
  </div>
);

export default Archived;
