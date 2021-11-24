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
} from "./DatabaseBanner.styled";

const propTypes = {
  databaseId: PropTypes.number,
  onClose: PropTypes.func,
};

const DatabaseBanner = ({ databaseId, onClose }) => {
  return (
    <BannerRoot>
      <BannerWarningIcon name="warning" />
      <BannerContent>
        {t`You’re using a database driver which is now deprecated and will be removed in the next release.`}{" "}
        <BannerLink
          to={Urls.editDatabase(databaseId)}
          onClick={onClose}
        >{t`Show me`}</BannerLink>
      </BannerContent>
      <BannerCloseIcon name="close" onClick={onClose} />
    </BannerRoot>
  );
};

DatabaseBanner.propTypes = propTypes;

export default DatabaseBanner;
