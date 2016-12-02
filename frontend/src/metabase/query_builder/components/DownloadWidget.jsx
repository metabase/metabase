import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import Icon from "metabase/components/Icon.jsx";
import DownloadButton from "metabase/components/DownloadButton.jsx";

import FieldSet from "metabase/components/FieldSet.jsx";

const DownloadWidget = ({ className, card, datasetQuery, isLarge }) =>
    <PopoverWithTrigger
        triggerElement={<Icon className={className} title="Download this data" name='download' size={16} />}
    >
        <div className="p2" style={{ maxWidth: 300 }}>
            <h4>Download</h4>
            {isLarge &&
                <FieldSet className="my2 text-gold border-gold" legend="Warning">
                    <div className="my1">Your answer has a large number of rows so it could take awhile to download.</div>
                    <div>The maximum download size is 1 million rows.</div>
                </FieldSet>
            }
            <div className="flex flex-row mt2">
                {["csv", "json"].map(type =>
                    <DownloadButton
                        className="mr1 text-uppercase text-default"
                        url={card.id != null ?
                            `/api/card/${card.id}/query/${type}`:
                            `/api/dataset/${type}`
                        }
                        params={card.id != null ?
                            { parameters: JSON.stringify(datasetQuery.parameters) } :
                            { query: JSON.stringify(datasetQuery) }
                        }
                        extensions={[type]}
                    >
                        {type}
                    </DownloadButton>
                )}
            </div>
        </div>
    </PopoverWithTrigger>

DownloadWidget.propTypes = {
    className: PropTypes.string,
    card: PropTypes.object.isRequired,
    datasetQuery: PropTypes.object.isRequired,
    isLarge: PropTypes.bool
};

export default DownloadWidget;
