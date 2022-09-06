/* eslint-disable react/prop-types */
import React, { useState } from "react";
import PropTypes from "prop-types";

import { t } from "ttag";
import { parse as urlParse } from "url";
import querystring from "querystring";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import Icon from "metabase/components/Icon";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import DownloadButton from "metabase/components/DownloadButton";
import Tooltip from "metabase/components/Tooltip";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";

import * as Urls from "metabase/lib/urls";

import _ from "underscore";
import cx from "classnames";
import {
  WidgetFormat,
  WidgetHeader,
  WidgetMessage,
  WidgetRoot,
} from "./QueryDownloadWidget.styled";

const EXPORT_FORMATS = Urls.exportFormats;

const getLimitedDownloadSizeText = result =>
  PLUGIN_FEATURE_LEVEL_PERMISSIONS.getDownloadWidgetMessageOverride(result) ??
  t`The maximum download size is 1 million rows.`;

const QueryDownloadWidget = ({
  className,
  classNameClose,
  card,
  result,
  uuid,
  token,
  dashcardId,
  icon,
  params,
  visualizationSettings,
}) => {
  const [status, setStatus] = useState(`idle`);

  return (
    <PopoverWithTrigger
      triggerElement={() => renderIcon({ icon, status })}
      triggerClasses={cx(className, "text-brand-hover")}
      triggerClassesClose={classNameClose}
      disabled={status === `pending` ? true : null}
    >
      {({ onClose: closePopover }) => (
        <WidgetRoot
          isExpanded={result.data && result.data.rows_truncated != null}
        >
          <WidgetHeader>
            <h4>{t`Download full results`}</h4>
          </WidgetHeader>
          {result.data != null && result.data.rows_truncated != null && (
            <WidgetMessage>
              <p>{t`Your answer has a large number of rows so it could take a while to download.`}</p>
              <p>{getLimitedDownloadSizeText(result)}</p>
            </WidgetMessage>
          )}
          <div>
            {EXPORT_FORMATS.map(type => (
              <WidgetFormat key={type}>
                {dashcardId && token ? (
                  <DashboardEmbedQueryButton
                    key={type}
                    type={type}
                    dashcardId={dashcardId}
                    token={token}
                    card={card}
                    params={params}
                    onDownloadStart={() => {
                      setStatus("pending");
                      closePopover();
                    }}
                    onDownloadResolved={() => setStatus("resolved")}
                    onDownloadRejected={() => setStatus("rejected")}
                  />
                ) : uuid ? (
                  <PublicQueryButton
                    key={type}
                    type={type}
                    uuid={uuid}
                    result={result}
                    onDownloadStart={() => {
                      setStatus("pending");
                      closePopover();
                    }}
                    onDownloadResolved={() => setStatus("resolved")}
                    onDownloadRejected={() => setStatus("rejected")}
                  />
                ) : token ? (
                  <EmbedQueryButton
                    key={type}
                    type={type}
                    token={token}
                    onDownloadStart={() => {
                      setStatus("pending");
                      closePopover();
                    }}
                    onDownloadResolved={() => setStatus("resolved")}
                    onDownloadRejected={() => setStatus("rejected")}
                  />
                ) : card && card.id ? (
                  <SavedQueryButton
                    key={type}
                    type={type}
                    card={card}
                    result={result}
                    disabled={status === "pending"}
                    onDownloadStart={() => {
                      setStatus("pending");
                      closePopover();
                    }}
                    onDownloadResolved={() => setStatus("resolved")}
                    onDownloadRejected={() => setStatus("rejected")}
                  />
                ) : card && !card.id ? (
                  <UnsavedQueryButton
                    key={type}
                    type={type}
                    result={result}
                    visualizationSettings={visualizationSettings}
                    onDownloadStart={() => {
                      setStatus("pending");
                      closePopover();
                    }}
                    onDownloadResolved={() => setStatus("resolved")}
                    onDownloadRejected={() => setStatus("rejected")}
                  />
                ) : null}
              </WidgetFormat>
            ))}
          </div>
        </WidgetRoot>
      )}
    </PopoverWithTrigger>
  );
};

const UnsavedQueryButton = ({
  type,
  result: { json_query = {} },
  visualizationSettings,
  onDownloadStart,
  onDownloadResolved,
  onDownloadRejected,
}) => (
  <DownloadButton
    url={`api/dataset/${type}`}
    params={{
      query: JSON.stringify(_.omit(json_query, "constraints")),
      visualization_settings: JSON.stringify(visualizationSettings),
    }}
    extensions={[type]}
    onDownloadStart={onDownloadStart}
    onDownloadResolved={onDownloadResolved}
    onDownloadRejected={onDownloadRejected}
  >
    {type}
  </DownloadButton>
);

const SavedQueryButton = ({
  type,
  result: { json_query = {} },
  card,
  onDownloadStart,
  onDownloadResolved,
  onDownloadRejected,
}) => (
  <DownloadButton
    url={`api/card/${card.id}/query/${type}`}
    params={{ parameters: JSON.stringify(json_query.parameters) }}
    extensions={[type]}
    onDownloadStart={onDownloadStart}
    onDownloadResolved={onDownloadResolved}
    onDownloadRejected={onDownloadRejected}
  >
    {type}
  </DownloadButton>
);

const PublicQueryButton = ({
  type,
  uuid,
  result: { json_query = {} },
  onDownloadStart,
  onDownloadResolved,
  onDownloadRejected,
}) => (
  <DownloadButton
    method="GET"
    url={Urls.publicQuestion(uuid, type)}
    params={{ parameters: JSON.stringify(json_query.parameters) }}
    extensions={[type]}
    onDownloadStart={onDownloadStart}
    onDownloadResolved={onDownloadResolved}
    onDownloadRejected={onDownloadRejected}
  >
    {type}
  </DownloadButton>
);

const EmbedQueryButton = ({
  type,
  token,
  onDownloadStart,
  onDownloadResolved,
  onDownloadRejected,
}) => {
  // Parse the query string part of the URL (e.g. the `?key=value` part) into an object. We need to pass them this
  // way to the `DownloadButton` because it's a form which means we need to insert a hidden `<input>` for each param
  // we want to pass along. For whatever wacky reason the /api/embed endpoint expect params like ?key=value instead
  // of like ?params=<json-encoded-params-array> like the other endpoints do.
  const query = urlParse(window.location.href).query; // get the part of the URL that looks like key=value
  const params = query && querystring.parse(query); // expand them out into a map

  return (
    <DownloadButton
      method="GET"
      url={Urls.embedCard(token, type)}
      params={params}
      extensions={[type]}
      onDownloadStart={onDownloadStart}
      onDownloadResolved={onDownloadResolved}
      onDownloadRejected={onDownloadRejected}
    >
      {type}
    </DownloadButton>
  );
};

const DashboardEmbedQueryButton = ({
  type,
  dashcardId,
  token,
  card,
  params,
  onDownloadStart,
  onDownloadResolved,
  onDownloadRejected,
}) => (
  <DownloadButton
    method="GET"
    url={`api/embed/dashboard/${token}/dashcard/${dashcardId}/card/${card.id}/${type}`}
    extensions={[type]}
    params={params}
    onDownloadStart={onDownloadStart}
    onDownloadResolved={onDownloadResolved}
    onDownloadRejected={onDownloadRejected}
  >
    {type}
  </DownloadButton>
);

const renderIcon = ({ icon, status }) => {
  if ([`idle`, `resolved`, `rejected`].includes(status)) {
    return (
      <Tooltip tooltip={t`Download full results`}>
        <Icon title={t`Download this data`} name={icon} size={20} />
      </Tooltip>
    );
  } else if (status === "pending") {
    return (
      <Tooltip tooltip={t`Downloading…`}>
        <LoadingSpinner size={18} />
      </Tooltip>
    );
  } else {
    throw new Error(`Unknown download status: ${status}`);
  }
};

QueryDownloadWidget.propTypes = {
  card: PropTypes.object,
  result: PropTypes.object,
  uuid: PropTypes.string,
  icon: PropTypes.string,
  params: PropTypes.object,
};

QueryDownloadWidget.defaultProps = {
  result: {},
  icon: "download",
  params: {},
};

QueryDownloadWidget.shouldRender = ({ result, isResultDirty }) =>
  !isResultDirty &&
  result &&
  !result.error &&
  PLUGIN_FEATURE_LEVEL_PERMISSIONS.canDownloadResults(result);

export default QueryDownloadWidget;
