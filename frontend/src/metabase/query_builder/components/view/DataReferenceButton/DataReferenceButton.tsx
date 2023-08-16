import { t } from "ttag";
import cx from "classnames";

import { Icon } from "metabase/core/components/Icon";
import Tooltip from "metabase/core/components/Tooltip";

interface DataReferenceButtonProps {
  className?: string;
  isShowingDataReference: boolean;
  size?: number;
  toggleDataReference: () => void;
}

export const DataReferenceButton = ({
  className,
  isShowingDataReference,
  size,
  toggleDataReference,
}: DataReferenceButtonProps) => (
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
