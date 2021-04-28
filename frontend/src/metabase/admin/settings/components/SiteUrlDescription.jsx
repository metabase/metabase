import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

const STRONG_TEXT = "Only change this if you know what you're doing!";

function SiteUrlDescription({ description }) {
  if (!description.includes(STRONG_TEXT)) {
    return description;
  }
  // eslint-disable-next-line no-unused-vars
  let [_, text] = description.split(STRONG_TEXT);
  text = text.trim();
  return (
    <React.Fragment>
      <strong>{t(STRONG_TEXT)}</strong> {t(text)}
    </React.Fragment>
  );
}

SiteUrlDescription.propTypes = {
  description: PropTypes.string.isRequired,
};

export default SiteUrlDescription;
