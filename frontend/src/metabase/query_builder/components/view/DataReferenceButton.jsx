/* eslint-disable react/prop-types */
import cx from "classnames";
import { t } from "ttag";

import { Icon } from "metabase/core/components/Icon";
import Tooltip from "metabase/core/components/Tooltip";
import NativeQuery from "metabase-lib/queries/NativeQuery";

const DataReferenceButton = ({
  isShowingDataReference,
  toggleDataReference,
  size,
  className,
}) => (
  <Tooltip tooltip={t`Learn about your data`}>
    <a
      className={cx(className, "transition-color text-brand-hover", {
        "text-brand": isShowingDataReference,
      })}
    >
      <Icon name="reference" size={size} onClick={toggleDataReference} />
    </a>
  </Tooltip>
);

DataReferenceButton.shouldRender = ({ question }) =>
  question.query() instanceof NativeQuery;

export default DataReferenceButton;
