/* eslint-disable react/prop-types */
import React, { useState } from "react";
import PropTypes from "prop-types";

import { t } from "ttag";

import cx from "classnames";
import { canSavePng } from "metabase/visualizations";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import Icon from "metabase/components/Icon";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import {
  DownloadButton,
  SaveAsPngButton,
} from "metabase/components/DownloadButton";
import Tooltip from "metabase/core/components/Tooltip";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import * as Urls from "metabase/lib/urls";
import { getDownloadButtonParams } from "./utils";

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
  dashboardId,
  icon,
  iconSize = 20,
  params,
  visualizationSettings,
}) => {
  const [status, setStatus] = useState(`idle`);

  return (
    <PopoverWithTrigger
      triggerElement={() => renderIcon({ icon, status, iconSize })}
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
            <>
              {EXPORT_FORMATS.map(type => (
                <WidgetFormat key={type}>
                  <DownloadButton
                    {...getDownloadButtonParams({
                      type,
                      params,
                      card,
                      visualizationSettings,
                      result,
                      uuid,
                      token,
                      dashcardId,
                      dashboardId,
                    })}
                    extensions={[type]}
                    onDownloadStart={() => {
                      setStatus("pending");
                      closePopover();
                    }}
                    onDownloadResolved={() => setStatus("resolved")}
                    onDownloadRejected={() => setStatus("rejected")}
                  >
                    {type}
                  </DownloadButton>
                </WidgetFormat>
              ))}
              {canSavePng(card.display) ? (
                <SaveAsPngButton card={card} onSave={closePopover} />
              ) : null}
            </>
          </div>
        </WidgetRoot>
      )}
    </PopoverWithTrigger>
  );
};

const LOADER_SCALE_FACTOR = 0.9;

const renderIcon = ({ icon, status, iconSize }) => {
  if ([`idle`, `resolved`, `rejected`].includes(status)) {
    return (
      <Tooltip tooltip={t`Download full results`}>
        <Icon
          data-testid="download-button"
          title={t`Download this data`}
          name={icon}
          size={iconSize}
        />
      </Tooltip>
    );
  } else if (status === "pending") {
    return (
      <Tooltip tooltip={t`Downloading…`}>
        <LoadingSpinner size={iconSize * LOADER_SCALE_FACTOR} />
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
  className: PropTypes.string,
  classNameClose: PropTypes.string,
  visualizationSettings: PropTypes.object,
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
