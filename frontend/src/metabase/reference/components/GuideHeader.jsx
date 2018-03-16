import React from "react";
import PropTypes from "prop-types";
import pure from "recompose/pure";
import { t } from "c-3po";
import EditButton from "metabase/reference/components/EditButton.jsx";

const GuideHeader = ({ startEditing, isSuperuser }) => (
  <div>
    <div className="wrapper wrapper--trim sm-py4 sm-my3">
      <div className="flex align-center">
        <h1 className="text-dark" style={{ fontWeight: 700 }}>
          {t`Start here`}.
        </h1>
        {isSuperuser && (
          <span className="ml-auto">
            <EditButton startEditing={startEditing} />
          </span>
        )}
      </div>
      <p
        className="text-paragraph"
        style={{ maxWidth: 620 }}
      >{t`This is the perfect place to start if you’re new to your company’s data, or if you just want to check in on what’s going on.`}</p>
    </div>
  </div>
);

GuideHeader.propTypes = {
  startEditing: PropTypes.func.isRequired,
  isSuperuser: PropTypes.bool,
};

export default pure(GuideHeader);
