/* @flow */

import React, { Component, PropTypes } from "react";

import EmbedFrame from "./EmbedFrame";

type Props = {
    message?: string
};

const PublicError = ({ message = "An error occurred" }: Props) =>
    <EmbedFrame className="spread">
        <div className="flex layout-centered flex-full flex-column">
            <div className="QueryError-image QueryError-image--noRows"></div>
            <div className="mt1 h4 sm-h3 md-h2 text-bold">
                {message}
            </div>
        </div>
    </EmbedFrame>;

export default PublicError;
