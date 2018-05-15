import React from "react";
import PropTypes from "prop-types";

import { t } from "c-3po";
import { parse as urlParse } from "url";
import querystring from "querystring";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import Icon from "metabase/components/Icon.jsx";
import DownloadButton from "metabase/components/DownloadButton.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";

import FieldSet from "metabase/components/FieldSet.jsx";

import * as Urls from "metabase/lib/urls";

import _ from "underscore";
import cx from "classnames";

const EXPORT_FORMATS = ["csv", "xlsx", "json"];

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
}) => (
  <PopoverWithTrigger
    triggerElement={
      <Tooltip tooltip={t`Download full results`}>
        <Icon title={t`Download this data`} name={icon} size={16} />
      </Tooltip>
    }
    triggerClasses={cx(className, "text-brand-hover")}
    triggerClassesClose={classNameClose}
  >
    <div className="p2" style={{ maxWidth: 320 }}>
      <h4>{t`Download full results`}</h4>
      {result.data != null &&
        result.data.rows_truncated != null && (
          <FieldSet className="my2 text-gold border-gold" legend={t`Warning`}>
            <div className="my1">{t`Your answer has a large number of rows so it could take a while to download.`}</div>
            <div>{t`The maximum download size is 1 million rows.`}</div>
          </FieldSet>
        )}
      <div className="flex flex-row mt2">
        {EXPORT_FORMATS.map(
          type =>
            dashcardId && token ? (
              <DashboardEmbedQueryButton
                key={type}
                type={type}
                dashcardId={dashcardId}
                token={token}
                card={card}
                params={params}
                className="mr1 text-uppercase text-default"
              />
            ) : uuid ? (
              <PublicQueryButton
                key={type}
                type={type}
                uuid={uuid}
                result={result}
                className="mr1 text-uppercase text-default"
              />
            ) : token ? (
              <EmbedQueryButton
                key={type}
                type={type}
                token={token}
                className="mr1 text-uppercase text-default"
              />
            ) : card && card.id ? (
              <SavedQueryButton
                key={type}
                type={type}
                card={card}
                result={result}
                className="mr1 text-uppercase text-default"
              />
            ) : card && !card.id ? (
              <UnsavedQueryButton
                key={type}
                type={type}
                card={card}
                result={result}
                className="mr1 text-uppercase text-default"
              />
            ) : null,
        )}
      </div>
    </div>
  </PopoverWithTrigger>
);

const UnsavedQueryButton = ({
  className,
  type,
  result: { json_query },
  card,
}) => (
  <DownloadButton
    className={className}
    url={`api/dataset/${type}`}
    params={{ query: JSON.stringify(_.omit(json_query, "constraints")) }}
    extensions={[type]}
  >
    {type}
  </DownloadButton>
);

const SavedQueryButton = ({
  className,
  type,
  result: { json_query },
  card,
}) => (
  <DownloadButton
    className={className}
    url={`api/card/${card.id}/query/${type}`}
    params={{ parameters: JSON.stringify(json_query.parameters) }}
    extensions={[type]}
  >
    {type}
  </DownloadButton>
);

const PublicQueryButton = ({
  className,
  type,
  uuid,
  result: { json_query },
}) => (
  <DownloadButton
    className={className}
    method="GET"
    url={Urls.publicQuestion(uuid, type)}
    params={{ parameters: JSON.stringify(json_query.parameters) }}
    extensions={[type]}
  >
    {type}
  </DownloadButton>
);

const EmbedQueryButton = ({ className, type, token }) => {
  // Parse the query string part of the URL (e.g. the `?key=value` part) into an object. We need to pass them this
  // way to the `DownloadButton` because it's a form which means we need to insert a hidden `<input>` for each param
  // we want to pass along. For whatever wacky reason the /api/embed endpoint expect params like ?key=value instead
  // of like ?params=<json-encoded-params-array> like the other endpoints do.
  const query = urlParse(window.location.href).query; // get the part of the URL that looks like key=value
  const params = query && querystring.parse(query); // expand them out into a map

  return (
    <DownloadButton
      className={className}
      method="GET"
      url={Urls.embedCard(token, type)}
      params={params}
      extensions={[type]}
    >
      {type}
    </DownloadButton>
  );
};

const DashboardEmbedQueryButton = ({
  className,
  type,
  dashcardId,
  token,
  card,
  params,
}) => (
  <DownloadButton
    className={className}
    method="GET"
    url={`/api/embed/dashboard/${token}/dashcard/${dashcardId}/card/${
      card.id
    }/${type}`}
    extensions={[type]}
    params={params}
  >
    {type}
  </DownloadButton>
);

QueryDownloadWidget.propTypes = {
  className: PropTypes.string,
  classNameClose: PropTypes.string,
  card: PropTypes.object,
  result: PropTypes.object,
  uuid: PropTypes.string,
  icon: PropTypes.string,
  params: PropTypes.object,
};

QueryDownloadWidget.defaultProps = {
  result: {},
  icon: "downarrow",
  params: {},
};

export default QueryDownloadWidget;
