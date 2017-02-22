import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import Icon from "metabase/components/Icon.jsx";
import DownloadButton from "metabase/components/DownloadButton.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";

import FieldSet from "metabase/components/FieldSet.jsx";

import Urls from "metabase/lib/urls";

import _ from "underscore";
import cx from "classnames";

const QueryDownloadWidget = ({ className, card, result, uuid }) =>
    <PopoverWithTrigger
        triggerElement={
            <Tooltip tooltip="Download">
                <Icon title="Download this data" name="downarrow" size={16} />
            </Tooltip>
        }
        triggerClasses={cx(className, "text-brand-hover")}
    >
        <div className="p2" style={{ maxWidth: 300 }}>
            <h4>Download</h4>
            { result.data.rows_truncated != null &&
                <FieldSet className="my2 text-gold border-gold" legend="Warning">
                    <div className="my1">Your answer has a large number of rows so it could take awhile to download.</div>
                    <div>The maximum download size is 1 million rows.</div>
                </FieldSet>
            }
            <div className="flex flex-row mt2">
                {["csv", "json"].map(type =>
                    uuid ?
                        <PublicQueryButton type={type} uuid={uuid} className="mr1 text-uppercase text-default" />
                    : card.id ?
                        <SavedQueryButton type={type} card={card} result={result} className="mr1 text-uppercase text-default" />
                    :
                        <UnsavedQueryButton type={type} card={card} result={result} className="mr1 text-uppercase text-default" />
                )}
            </div>
        </div>
    </PopoverWithTrigger>

const UnsavedQueryButton = ({ className, type, result: { json_query }, card }) =>
    <DownloadButton
        className={className}
        url={`/api/dataset/${type}`}
        params={{ query: JSON.stringify(_.omit(json_query, "constraints")) }}
        extensions={[type]}
    >
        {type}
    </DownloadButton>

const SavedQueryButton = ({ className, type, result: { json_query }, card }) =>
    <DownloadButton
        className={className}
        url={`/api/card/${card.id}/query/${type}`}
        params={{ parameters: JSON.stringify(json_query.parameters) }}
        extensions={[type]}
    >
        {type}
    </DownloadButton>

const PublicQueryButton = ({ className, type, uuid }) =>
    <DownloadButton
        className={className}
        method="GET"
        url={Urls.publicCard(uuid, type)}
        extensions={[type]}
    >
        {type}
    </DownloadButton>

QueryDownloadWidget.propTypes = {
    className: PropTypes.string,
    card: PropTypes.object,
    result: PropTypes.object,
    uuid: PropTypes.string
};

export default QueryDownloadWidget;
