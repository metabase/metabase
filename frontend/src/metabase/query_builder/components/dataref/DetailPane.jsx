/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";
import cx from "classnames";
import Icon from "metabase/components/Icon.jsx";
import Card from "metabase/components/Card.jsx";

const DetailPane = ({ name, description, extra }) => (
  <div className="ml1">
    <div className="flex align-center">
      <Icon name="field" className="text-medium pr1" size={16} />
      <h3>{name}</h3>
    </div>
    <p className={cx({ "text-medium": !description })}>
      {description || t`No description`}
    </p>
    {extra}
    <h5 className="text-uppercase mt4 mb2">Sample values</h5>
    <Card>
      <ul className="pt1">
        <li className="px1 pb1 mb1 border-bottom">Sample value</li>
        <li className="px1 pb1 mb1 border-bottom">Sample value</li>
        <li className="px1 pb1 mb1 border-bottom">Sample value</li>
        <li className="px1 pb1 mb1 border-bottom">Sample value</li>
        <li className="px1 pb1 mb1 border-bottom">Sample value</li>
        <li className="px1 pb1 mb1 border-bottom">Sample value</li>
        <li className="px1 pb1 mb1 border-bottom">Sample value</li>
        <li className="px1 pb1 mb1 border-bottom">Sample value</li>
        <li className="px1 pb1 mb1 border-bottom">Sample value</li>
        <li className="px1 pb1">Sample value</li>
      </ul>
    </Card>
  </div>
);

DetailPane.propTypes = {
  name: PropTypes.string.isRequired,
  description: PropTypes.string,
  error: PropTypes.string,
  extra: PropTypes.element,
};

export default DetailPane;
