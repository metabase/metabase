import cx from "classnames";
import { memo } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";

import S from "./Detail.module.css";

interface DetailField {
  name: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  error?: string;
  touched?: boolean;
}

interface DetailProps {
  name: string;
  description?: string | null;
  placeholder?: string;
  subtitleClass?: string;
  url?: string;
  isEditing?: boolean;
  field?: DetailField;
}

const Detail = ({
  name,
  description,
  placeholder,
  subtitleClass,
  url,
  isEditing,
  field,
}: DetailProps) => (
  <div className={cx(S.detail)}>
    <div className={isEditing ? cx(S.detailBody, CS.flexFull) : S.detailBody}>
      <div className={S.detailTitle}>
        {url ? <Link to={url}>{name}</Link> : <span>{name}</span>}
      </div>
      <div
        className={cx(description ? S.detailSubtitle : S.detailSubtitleLight)}
      >
        {isEditing && field ? (
          <textarea
            className={S.detailTextarea}
            name={field.name}
            placeholder={placeholder}
            onChange={field.onChange}
            //FIXME: use initialValues from redux forms instead of default value
            // to allow for reinitializing on cancel (see GettingStartedGuide.jsx)
            defaultValue={description ?? undefined}
          />
        ) : (
          <span className={subtitleClass}>
            {description || placeholder || t`No description yet`}
          </span>
        )}
        {isEditing && field?.error && field?.touched && (
          <span className={CS.textError}>{field.error}</span>
        )}
      </div>
    </div>
  </div>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default memo(Detail);
