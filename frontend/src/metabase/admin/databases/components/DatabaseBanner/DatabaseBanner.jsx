import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import {
  BannerContent,
  BannerRoot,
  BannerWarning,
} from "./DatabaseBanner.styled";

const propTypes = {
  databaseId: PropTypes.number,
  onShow: PropTypes.func,
  onClose: PropTypes.func,
};

const DatabaseBanner = ({ databaseId, onShow, onClose }) => {
  return (
    <BannerRoot>
      <BannerWarning name="warning" />
      <BannerContent>{t`You’re using a database driver which is now deprecated and will be removed in the next release.`}</BannerContent>
    </BannerRoot>
  );
};

DatabaseBanner.propTypes = propTypes;

export default DatabaseBanner;
