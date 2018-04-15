/* @flow */

import React from "react";
import { t } from "c-3po";
import EmbedFrame from "./EmbedFrame";

const PublicNotFound = () => (
  <EmbedFrame className="spread">
    <div className="flex layout-centered flex-full flex-column">
      <div className="QueryError-image QueryError-image--noRows" />
      <div className="mt1 h4 sm-h3 md-h2 text-bold">{t`Not found`}</div>
    </div>
  </EmbedFrame>
);

export default PublicNotFound;
