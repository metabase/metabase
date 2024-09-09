/* eslint "react/prop-types": "warn" */
import cx from "classnames";
import PropTypes from "prop-types";
import { memo } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import Markdown from "metabase/core/components/Markdown";
import CS from "metabase/css/core/index.css";

import S from "./Detail.module.css";

const Detail = ({
  name,
  description,
  placeholder,
  subtitleClass,
  url,
  icon,
  isEditing,
  field,
  isMarkdown = false,
}) => (
  <div className={cx(S.detail)}>
    <div className={isEditing ? cx(S.detailBody, CS.flexFull) : S.detailBody}>
      <div className={S.detailTitle}>
        {url ? <Link to={url}>{name}</Link> : <span>{name}</span>}
      </div>
      <div
        className={cx(description ? S.detailSubtitle : S.detailSubtitleLight)}
      >
        {isEditing ? (
          <textarea
            className={S.detailTextarea}
            name={field.name}
            placeholder={placeholder}
            onChange={field.onChange}
            //FIXME: use initialValues from redux forms instead of default value
            // to allow for reinitializing on cancel (see GettingStartedGuide.jsx)
            defaultValue={description}
          />
        ) : (
          isMarkdown ? (
          <Markdown className={subtitleClass}>
            {description || placeholder || t`No description yet`}
          </Markdown>) : (<span className={subtitleClass}>{description || placeholder || t`No description yet`}</span>)
        )}
        {isEditing && field.error && field.touched && (
          <span className={CS.textError}>{field.error}</span>
        )}
      </div>
    </div>
  </div>
);

Detail.propTypes = {
  name: PropTypes.string.isRequired,
  url: PropTypes.string,
  description: PropTypes.string,
  placeholder: PropTypes.string,
  subtitleClass: PropTypes.string,
  icon: PropTypes.string,
  isEditing: PropTypes.bool,
  field: PropTypes.object,
  isMarkdown: PropTypes.bool,
};

export default memo(Detail);
