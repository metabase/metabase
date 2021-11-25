import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import {
  BannerCloseIcon,
  BannerContent,
  BannerLink,
  BannerRoot,
  BannerWarningIcon,
} from "./EngineDeprecationBanner.styled";

const propTypes = {
  database: PropTypes.object,
  isEnabled: PropTypes.bool,
  onClose: PropTypes.func,
};

const EngineDeprecationBanner = ({ database, isEnabled, onClose }) => {
  if (!database || !isEnabled) {
    return null;
  }

  return (
    <BannerRoot>
      <BannerWarningIcon name="warning" />
      <BannerContent>
        {t`You’re using a database driver which is now deprecated and will be removed in the next release.`}{" "}
        <BannerLink
          to={Urls.editDatabase(database.id)}
          onClick={onClose}
        >{t`Show me`}</BannerLink>
      </BannerContent>
      <BannerCloseIcon name="close" onClick={onClose} />
    </BannerRoot>
  );
};

EngineDeprecationBanner.propTypes = propTypes;

export default EngineDeprecationBanner;
