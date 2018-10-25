import React from "react";
import PropTypes from "prop-types";
import { Box } from "grid-styled";

import { t } from "c-3po";
import { parse as urlParse } from "url";
import querystring from "querystring";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import Icon from "metabase/components/Icon.jsx";
import DownloadButton from "metabase/components/DownloadButton.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";

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
    <Box
      p={2}
      w={result.data && result.data.rows_truncated != null ? 300 : 260}
    >
      <Box p={1}>
        <h4>{t`Download full results`}</h4>
      </Box>
      {result.data != null &&
        result.data.rows_truncated != null && (
          <Box>
            <p
            >{t`Your answer has a large number of rows so it could take a while to download.`}</p>
            <p>{t`The maximum download size is 1 million rows.`}</p>
          </Box>
        )}
      <Box>
        {EXPORT_FORMATS.map(type => (
          <Box w={"100%"}>
            {dashcardId && token ? (
              <DashboardEmbedQueryButton
                key={type}
                type={type}
                dashcardId={dashcardId}
                token={token}
                card={card}
                params={params}
              />
            ) : uuid ? (
              <PublicQueryButton
                key={type}
                type={type}
                uuid={uuid}
                result={result}
              />
            ) : token ? (
              <EmbedQueryButton key={type} type={type} token={token} />
            ) : card && card.id ? (
              <SavedQueryButton
                key={type}
                type={type}
                card={card}
                result={result}
              />
            ) : card && !card.id ? (
              <UnsavedQueryButton
                key={type}
                type={type}
                card={card}
                result={result}
              />
            ) : null}
          </Box>
        ))}
      </Box>
    </Box>
  </PopoverWithTrigger>
);

const UnsavedQueryButton = ({ type, result: { json_query }, card }) => (
  <DownloadButton
    url={`api/dataset/${type}`}
    params={{ query: JSON.stringify(_.omit(json_query, "constraints")) }}
    extensions={[type]}
  >
    {type}
  </DownloadButton>
);

const SavedQueryButton = ({ type, result: { json_query }, card }) => (
  <DownloadButton
    url={`api/card/${card.id}/query/${type}`}
    params={{ parameters: JSON.stringify(json_query.parameters) }}
    extensions={[type]}
  >
    {type}
  </DownloadButton>
);

const PublicQueryButton = ({ type, uuid, result: { json_query } }) => (
  <DownloadButton
    method="GET"
    url={Urls.publicQuestion(uuid, type)}
    params={{ parameters: JSON.stringify(json_query.parameters) }}
    extensions={[type]}
  >
    {type}
  </DownloadButton>
);

const EmbedQueryButton = ({ type, token }) => {
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
}) => (
  <DownloadButton
    method="GET"
    url={`api/embed/dashboard/${token}/dashcard/${dashcardId}/card/${
      card.id
    }/${type}`}
    extensions={[type]}
    params={params}
  >
    {type}
  </DownloadButton>
);

QueryDownloadWidget.propTypes = {
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
